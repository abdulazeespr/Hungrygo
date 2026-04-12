# Hungrygo — Phase 2: Core (Mess Discovery, Menu & Pricing)
> **LLM Instruction:** Phase 1 (auth, users, Prisma 7 setup) is complete. Extend `prisma/schema.prisma` by **appending** new models — never recreate. Run `prisma migrate dev` after schema changes. Repositories import `prisma` from `config/database.ts` and types from `../generated/prisma/client.js`. Use `prisma.$queryRaw` only for PostGIS geo queries. Follow folder structure, schema, API contracts, and checklist exactly.

---

## 1. PRD Summary

### Goal
Enable customers to discover nearby mess providers (geo search), view mess details, browse daily menus, and see pricing plans. Enable mess owners to register and manage their mess, pricing, and menus.

### Scope (Phase 2 only)
- Append to `prisma/schema.prisma`: `Address`, `MessProvider`, `PricingPlan`, `Menu` models
- User profile: GET + PATCH
- User addresses: full CRUD
- Mess owner: register mess, update mess, manage pricing plans
- Mess owner: upsert daily menu per meal slot
- Customer: geo-radius discover nearby messes (`prisma.$queryRaw` + PostGIS)
- Customer: mess detail + pricing, today's menu + date-range menu
- Redis caching: nearby search results (5 min), mess detail (10 min), daily menus (1 hr)

### Out of Scope
Subscriptions, payments, reviews — Phases 3–5.

### Success Criteria
- `GET /api/v1/mess-providers?lat=&lng=` returns sorted results via PostGIS `ST_DWithin`
- Nearby results cached; invalidated on mess update
- Pricing plan upsert enforces unique `(messId, mealSlot, durationType)` via Prisma
- All list endpoints paginated with cursor

---

## 2. Prisma Schema — Phase 2 Additions

### Append to `prisma/schema.prisma`

```prisma
// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 ENUMS
// ─────────────────────────────────────────────────────────────────────────────

enum DietaryType {
  veg
  non_veg
  both
}

enum MessStatus {
  pending
  active
  suspended
  closed
}

enum MealSlot {
  breakfast
  lunch
  dinner
  full_day
}

enum DurationType {
  daily
  weekly
  monthly
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 MODELS
// ─────────────────────────────────────────────────────────────────────────────

model Address {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @map("user_id") @db.Uuid
  label       String   @default("Home") @db.VarChar(50)
  fullAddress String   @map("full_address")
  city        String   @db.VarChar(100)
  state       String   @db.VarChar(100)
  pincode     String   @db.VarChar(10)
  lat         Decimal  @db.Decimal(10, 7)
  lng         Decimal  @db.Decimal(10, 7)
  isDefault   Boolean  @default(false) @map("is_default")
  createdAt   DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("addresses")
}

model MessProvider {
  id           String      @id @default(uuid()) @db.Uuid
  ownerId      String      @map("owner_id") @db.Uuid
  name         String      @db.VarChar(150)
  description  String?
  fssaiNumber  String?     @map("fssai_number") @db.VarChar(20)
  phone        String?     @db.VarChar(15)
  address      String
  city         String      @db.VarChar(100)
  pincode      String?     @db.VarChar(10)
  lat          Decimal     @db.Decimal(10, 7)
  lng          Decimal     @db.Decimal(10, 7)
  // PostGIS `location` GEOGRAPHY column is added via raw migration edit — not in Prisma schema
  dietaryType  DietaryType @default(veg)     @map("dietary_type")
  status       MessStatus  @default(pending)
  avgRating    Decimal     @default(0.00)    @map("avg_rating") @db.Decimal(3, 2)
  totalReviews Int         @default(0)       @map("total_reviews")
  coverImage   String?     @map("cover_image")
  opensAt      String      @default("07:00") @map("opens_at") @db.VarChar(5)
  closesAt     String      @default("22:00") @map("closes_at") @db.VarChar(5)
  createdAt    DateTime    @default(now())   @map("created_at")
  updatedAt    DateTime    @updatedAt        @map("updated_at")

  owner        User          @relation(fields: [ownerId], references: [id], onDelete: Restrict)
  pricingPlans PricingPlan[]
  menus        Menu[]

  @@index([ownerId])
  @@index([status])
  @@index([city])
  @@map("mess_providers")
}

model PricingPlan {
  id           String       @id @default(uuid()) @db.Uuid
  messId       String       @map("mess_id") @db.Uuid
  mealSlot     MealSlot     @map("meal_slot")
  durationType DurationType @map("duration_type")
  price        Decimal      @db.Decimal(10, 2)
  isActive     Boolean      @default(true) @map("is_active")
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt      @map("updated_at")

  mess MessProvider @relation(fields: [messId], references: [id], onDelete: Cascade)

  @@unique([messId, mealSlot, durationType])
  @@index([messId])
  @@map("pricing_plans")
}

model Menu {
  id        String   @id @default(uuid()) @db.Uuid
  messId    String   @map("mess_id") @db.Uuid
  date      DateTime @db.Date
  mealSlot  MealSlot @map("meal_slot")
  items     Json     @default("[]")
  // items structure: Array<{ name: string; description: string; isSpecial: boolean }>
  photoUrl  String?  @map("photo_url")
  isHoliday Boolean  @default(false) @map("is_holiday")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt      @map("updated_at")

  mess MessProvider @relation(fields: [messId], references: [id], onDelete: Cascade)

  @@unique([messId, date, mealSlot])
  @@index([messId, date])
  @@map("menus")
}
```

### Append relation fields to existing User model
```prisma
// Add inside User model:
addresses     Address[]
messProviders MessProvider[]
```

### PostGIS Column — Edit Generated Migration
> After `prisma migrate dev`, manually edit the generated migration SQL file to add:

```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add GEOGRAPHY column to mess_providers (generated from lat/lng)
ALTER TABLE mess_providers
  ADD COLUMN location GEOGRAPHY(POINT, 4326)
  GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(lng::float8, lat::float8), 4326)::geography
  ) STORED;

-- GIST index for radius queries
CREATE INDEX idx_mess_location ON mess_providers USING GIST(location);
```

### Redis Keys (Phase 2)

| Key Pattern | TTL | Type | Purpose |
|---|---|---|---|
| `hungrygo:mess:nearby:{queryHash}` | 300s | JSON | Cached geo search (hash of query params) |
| `hungrygo:mess:{id}` | 600s | JSON | Cached mess detail |
| `hungrygo:mess:{id}:menu:{YYYY-MM-DD}` | 3600s | JSON | Cached daily menu |

> Prefix all Redis keys with `hungrygo:` to avoid collisions.

---

## 3. Folder & File Structure

> Only new files for Phase 2. Phase 1 files unchanged except `prisma/schema.prisma` (append) and `src/app.ts` (add routes).

```
src/
├── modules/
│   │
│   ├── user/                          # NEW
│   │   ├── user.routes.ts
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   ├── user.repository.ts         # prisma.user.update, prisma.address.*
│   │   ├── user.schema.ts
│   │   └── user.types.ts
│   │
│   ├── mess/                          # NEW
│   │   ├── mess.routes.ts
│   │   ├── mess.controller.ts
│   │   ├── mess.service.ts
│   │   ├── mess.repository.ts         # prisma.messProvider.* + $queryRaw for geo
│   │   ├── mess.schema.ts
│   │   └── mess.types.ts
│   │
│   └── menu/                          # NEW
│       ├── menu.routes.ts
│       ├── menu.controller.ts
│       ├── menu.service.ts
│       ├── menu.repository.ts         # prisma.menu.upsert
│       ├── menu.schema.ts
│       └── menu.types.ts
│
└── shared/errors/
    └── errorCodes.ts                  # APPEND Phase 2 codes
```

### Prisma 7 Import Pattern in Repositories
```typescript
// All Phase 2+ repositories follow this import pattern:
import prisma from '../../config/database.js';
import type { MessProvider, PricingPlan, Menu, Address } from '../../generated/prisma/client.js';
import { Prisma } from '../../generated/prisma/client.js';
```

### Geo Query with Prisma 7 `$queryRaw`
```typescript
// src/modules/mess/mess.repository.ts
import prisma from '../../config/database.js';
import { Prisma } from '../../generated/prisma/client.js';

export const messRepository = {
  async findNearby(params: GetNearbyParams) {
    const { lat, lng, radiusM, limit } = params;
    // Prisma.$queryRaw uses tagged template literals — params are auto-escaped
    return prisma.$queryRaw<MessWithDistance[]>`
      SELECT
        m.*,
        ROUND((ST_Distance(
          m.location,
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography
        ) / 1000)::numeric, 2) AS distance_km,
        (
          SELECT row_to_json(p)
          FROM (
            SELECT meal_slot, duration_type, price
            FROM pricing_plans
            WHERE mess_id = m.id AND is_active = true
            ORDER BY price ASC LIMIT 1
          ) p
        ) AS cheapest_plan
      FROM mess_providers m
      WHERE
        m.status = 'active'
        AND ST_DWithin(
          m.location,
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
          ${radiusM}::float8
        )
      ORDER BY distance_km ASC
      LIMIT ${Prisma.raw(String(limit))}
    `;
  },

  async findById(id: string) {
    return prisma.messProvider.findUnique({
      where: { id },
      include: { pricingPlans: { where: { isActive: true } } },
    });
  },

  async upsertPlan(messId: string, data: UpsertPlanDto) {
    return prisma.pricingPlan.upsert({
      where: {
        messId_mealSlot_durationType: {
          messId,
          mealSlot: data.mealSlot,
          durationType: data.durationType,
        },
      },
      update: { price: data.price, isActive: true },
      create: { messId, ...data },
    });
  },
};
```

---

## 4. API Endpoints

### Base URL: `/api/v1`

---

### 4.1 User Module

#### GET `/users/me` — Auth: Bearer
**Success `200`** — current user object from `prisma.user.findUnique({ where: { id: req.user.id } })`

#### PATCH `/users/me` — Auth: Bearer
**Request Body** (all optional): `{ name, email, dietaryPref }`
**Zod:** `name: string min 2 max 100 optional · email: email optional · dietaryPref: enum optional`
**Success `200`** — updated user

#### POST `/users/me/addresses` — Auth: Bearer
**Request Body:**
```json
{
  "label": "Home", "fullAddress": "Flat 302, Sunrise Apts",
  "city": "Pune", "state": "Maharashtra", "pincode": "411038",
  "lat": 18.5074, "lng": 73.8077, "isDefault": true
}
```
**Success `201`** — if `isDefault: true`, use `prisma.$transaction` to unset others first

#### GET `/users/me/addresses` — Auth: Bearer — returns address array
#### PATCH `/users/me/addresses/:id` — Auth: Bearer — partial update with `isDefault` toggle in transaction
#### DELETE `/users/me/addresses/:id` — Auth: Bearer — `200 { "message": "Address deleted" }`

---

### 4.2 Mess Module

#### GET `/mess-providers` — Auth: Public

**Query Parameters**

| Param | Type | Required | Default | Validation |
|---|---|---|---|---|
| `lat` | number | Yes | — | -90 to 90 |
| `lng` | number | Yes | — | -180 to 180 |
| `radius_km` | number | No | 5 | 0.5–50 |
| `dietary_type` | string | No | `all` | `veg\|non_veg\|both\|all` |
| `sort` | string | No | `distance` | `distance\|rating\|price` |
| `limit` | number | No | 20 | 1–50 |

**Success `200`**
```json
{
  "success": true,
  "data": [{
    "id": "uuid", "name": "Sunita Tiffin Center",
    "dietaryType": "veg", "avgRating": 4.3, "totalReviews": 87,
    "coverImage": "https://...", "distanceKm": 1.2,
    "city": "Pune", "status": "active", "opensAt": "07:00", "closesAt": "21:00",
    "cheapestPlan": { "mealSlot": "lunch", "durationType": "monthly", "price": 2200 }
  }],
  "meta": { "cursor": null, "has_more": false }
}
```
**Cache:** `hungrygo:mess:nearby:{md5(queryString)}` TTL 300s — skip when cursor present

---

#### GET `/mess-providers/:id` — Auth: Public
**Success `200`** — mess detail with `pricingPlans` included
**Errors:** `MESS_NOT_FOUND` 404

---

#### POST `/mess-providers` — Auth: Bearer (`mess_owner`)
**Request Body:**
```json
{
  "name": "Sunita Tiffin Center", "address": "12, Deccan Gymkhana",
  "city": "Pune", "pincode": "411004", "lat": 18.5204, "lng": 73.8567,
  "dietaryType": "veg", "opensAt": "07:00", "closesAt": "21:30"
}
```
**Zod:**
```typescript
z.object({ body: z.object({
  name:         z.string().min(3).max(150),
  description:  z.string().max(500).optional(),
  fssaiNumber:  z.string().length(14).optional(),
  phone:        z.string().regex(/^[6-9]\d{9}$/).optional(),
  address:      z.string().min(10),
  city:         z.string().min(2).max(100),
  pincode:      z.string().length(6),
  lat:          z.number().min(-90).max(90),
  lng:          z.number().min(-180).max(180),
  dietaryType:  z.enum(['veg','non_veg','both']).default('veg'),
  opensAt:      z.string().regex(/^\d{2}:\d{2}$/).optional(),
  closesAt:     z.string().regex(/^\d{2}:\d{2}$/).optional(),
})})
```
**Success `201`** — created mess (`status: pending`)
**Errors:** `AUTH_FORBIDDEN` 403

---

#### PATCH `/mess-providers/:id` — Auth: Bearer (owner only)
**Side Effects:** Invalidate `hungrygo:mess:{id}` + scan/delete `hungrygo:mess:nearby:*` Redis keys
**Errors:** `MESS_NOT_FOUND` 404 · `MESS_OWNER_MISMATCH` 403

---

#### GET `/mess-providers/:id/plans` — Auth: Public
**Success `200`** — array of active `pricingPlans`

---

#### POST `/mess-providers/:id/plans` — Auth: Bearer (mess owner)
**Request Body:** `{ "mealSlot": "lunch", "durationType": "monthly", "price": 2200 }`
**Success `200`** — `prisma.pricingPlan.upsert` on `@@unique([messId, mealSlot, durationType])`

---

### 4.3 Menu Module

#### GET `/mess-providers/:id/menus/today` — Auth: Public
**Success `200`**
```json
{
  "success": true,
  "data": [{
    "mealSlot": "lunch", "isHoliday": false,
    "items": [{ "name": "Dal Tadka", "description": "Yellow lentils", "isSpecial": false }],
    "photoUrl": null
  }]
}
```
**Cache:** `hungrygo:mess:{id}:menu:{YYYY-MM-DD}` TTL 3600s

---

#### GET `/mess-providers/:id/menus` — Auth: Public
**Query Params:** `from=YYYY-MM-DD`, `to=YYYY-MM-DD` (max 7 days)
**Success `200`** — array of menus grouped by date

---

#### PUT `/mess-providers/:id/menus` — Auth: Bearer (mess owner)
**Request Body:**
```json
{
  "date": "2026-04-01", "mealSlot": "lunch",
  "items": [{ "name": "Dal Tadka", "description": "", "isSpecial": false }],
  "isHoliday": false, "photoUrl": null
}
```
**Success `200`** — `prisma.menu.upsert` on `@@unique([messId, date, mealSlot])`
**Side Effects:** Invalidate `hungrygo:mess:{id}:menu:{date}`

---

#### DELETE `/mess-providers/:id/menus/:menuId` — Auth: Bearer (mess owner)
**Success `200`** — `{ "message": "Menu deleted" }`

---

## 5. OpenAPI Documentation

> **Setup is complete from Phase 1.** This phase only adds `@openapi` JSDoc blocks to new route files. The swagger-jsdoc glob `./src/modules/**/*.routes.ts` picks them up automatically.

### New Schemas (add to `src/config/swagger.ts` → `components.schemas`)

```typescript
Address: {
  type: 'object',
  properties: {
    id:          { type: 'string', format: 'uuid' },
    label:       { type: 'string', example: 'Home' },
    fullAddress: { type: 'string', example: 'Flat 302, Sunrise Apts, Kothrud' },
    city:        { type: 'string', example: 'Pune' },
    state:       { type: 'string', example: 'Maharashtra' },
    pincode:     { type: 'string', example: '411038' },
    lat:         { type: 'number', example: 18.5074 },
    lng:         { type: 'number', example: 73.8077 },
    isDefault:   { type: 'boolean' },
  },
},
MessProvider: {
  type: 'object',
  properties: {
    id:           { type: 'string', format: 'uuid' },
    name:         { type: 'string', example: 'Sunita Tiffin Center' },
    dietaryType:  { type: 'string', enum: ['veg', 'non_veg', 'both'] },
    avgRating:    { type: 'number', example: 4.3 },
    totalReviews: { type: 'integer', example: 87 },
    coverImage:   { type: 'string', nullable: true },
    city:         { type: 'string', example: 'Pune' },
    status:       { type: 'string', enum: ['pending', 'active', 'suspended', 'closed'] },
    opensAt:      { type: 'string', example: '07:00' },
    closesAt:     { type: 'string', example: '21:00' },
  },
},
MessWithDistance: {
  allOf: [
    { '$ref': '#/components/schemas/MessProvider' },
    { type: 'object', properties: {
        distanceKm:   { type: 'number', example: 1.2 },
        cheapestPlan: {
          type: 'object', nullable: true,
          properties: {
            mealSlot:     { type: 'string', example: 'lunch' },
            durationType: { type: 'string', example: 'monthly' },
            price:        { type: 'number', example: 2200 },
          },
        },
    }},
  ],
},
PricingPlan: {
  type: 'object',
  properties: {
    id:           { type: 'string', format: 'uuid' },
    mealSlot:     { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'full_day'] },
    durationType: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
    price:        { type: 'number', example: 2200 },
    isActive:     { type: 'boolean' },
  },
},
MenuItem: {
  type: 'object',
  properties: {
    name:        { type: 'string', example: 'Dal Tadka' },
    description: { type: 'string', example: 'Yellow lentils with ghee' },
    isSpecial:   { type: 'boolean', example: false },
  },
},
Menu: {
  type: 'object',
  properties: {
    mealSlot:  { type: 'string', enum: ['breakfast', 'lunch', 'dinner'] },
    isHoliday: { type: 'boolean' },
    items:     { type: 'array', items: { '$ref': '#/components/schemas/MenuItem' } },
    photoUrl:  { type: 'string', nullable: true },
  },
},
```

---

### User Routes (`user.routes.ts`)

```typescript
/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get current user profile
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/User' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   patch:
 *     tags: [Users]
 *     summary: Update current user profile
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:        { type: string, example: 'Ananya Sharma' }
 *               email:       { type: string, format: email }
 *               dietaryPref: { type: string, enum: [veg, non_veg, egg] }
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/User' }
 */

/**
 * @openapi
 * /users/me/addresses:
 *   get:
 *     tags: [Users]
 *     summary: List user addresses
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Address list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Address' }
 *   post:
 *     tags: [Users]
 *     summary: Add a delivery address
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullAddress, city, state, pincode, lat, lng]
 *             properties:
 *               label:       { type: string, example: 'Home' }
 *               fullAddress: { type: string, example: 'Flat 302, Sunrise Apts' }
 *               city:        { type: string, example: 'Pune' }
 *               state:       { type: string, example: 'Maharashtra' }
 *               pincode:     { type: string, example: '411038' }
 *               lat:         { type: number, example: 18.5074 }
 *               lng:         { type: number, example: 73.8077 }
 *               isDefault:   { type: boolean, example: true }
 *     responses:
 *       201:
 *         description: Address created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Address' }
 */
```

---

### Mess Routes (`mess.routes.ts`)

```typescript
/**
 * @openapi
 * /mess-providers:
 *   get:
 *     tags: [Mess]
 *     summary: Discover nearby mess providers
 *     description: >
 *       Returns active mess providers within the specified radius using
 *       PostGIS ST_DWithin. Results are cached in Redis for 5 minutes.
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number, example: 18.5204 }
 *       - in: query
 *         name: lng
 *         required: true
 *         schema: { type: number, example: 73.8567 }
 *       - in: query
 *         name: radius_km
 *         schema: { type: number, default: 5, minimum: 0.5, maximum: 50 }
 *       - in: query
 *         name: dietary_type
 *         schema: { type: string, enum: [veg, non_veg, both, all], default: all }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [distance, rating, price], default: distance }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, minimum: 1, maximum: 50 }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Nearby mess providers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/MessWithDistance' }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     cursor:   { type: string, nullable: true }
 *                     has_more: { type: boolean }
 *
 * /mess-providers/{id}:
 *   get:
 *     tags: [Mess]
 *     summary: Get mess detail with pricing plans
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Mess detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   allOf:
 *                     - { $ref: '#/components/schemas/MessProvider' }
 *                     - type: object
 *                       properties:
 *                         pricingPlans:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/PricingPlan' }
 *       404:
 *         description: Mess not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /mess-providers/{id}/plans:
 *   post:
 *     tags: [Mess]
 *     summary: Upsert a pricing plan
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mealSlot, durationType, price]
 *             properties:
 *               mealSlot:     { type: string, enum: [breakfast, lunch, dinner, full_day] }
 *               durationType: { type: string, enum: [daily, weekly, monthly] }
 *               price:        { type: number, example: 2200 }
 *     responses:
 *       200:
 *         description: Plan upserted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/PricingPlan' }
 */
```

---

### Menu Routes (`menu.routes.ts`)

```typescript
/**
 * @openapi
 * /mess-providers/{id}/menus/today:
 *   get:
 *     tags: [Menu]
 *     summary: Get today's menu for all meal slots
 *     description: Results cached in Redis for 1 hour.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Today's menus
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Menu' }
 *
 * /mess-providers/{id}/menus:
 *   put:
 *     tags: [Menu]
 *     summary: Upsert daily menu for a meal slot
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date, mealSlot, items]
 *             properties:
 *               date:      { type: string, format: date, example: '2026-04-01' }
 *               mealSlot:  { type: string, enum: [breakfast, lunch, dinner] }
 *               items:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/MenuItem' }
 *               isHoliday: { type: boolean, default: false }
 *               photoUrl:  { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Menu upserted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Menu' }
 */
```

---

## 6. Frontend Pages (Minimal Reference)

| Page | Route | Description |
|---|---|---|
| Home / Discover | `/` | Map + list of nearby messes |
| Mess Detail | `/mess/[id]` | Info, pricing, today's menu |
| My Profile | `/profile` | View/edit profile |
| My Addresses | `/profile/addresses` | CRUD addresses |
| Owner: Register Mess | `/owner/mess/new` | Registration form |
| Owner: Edit Mess | `/owner/mess/[id]` | Edit details + pricing |
| Owner: Menu Editor | `/owner/mess/[id]/menu` | Daily menu editor |

---

## 7. Tasks & Subtasks Checklist

### 7.1 Prisma Schema & Migration
- [ ] Append Phase 2 enums + `Address`, `MessProvider`, `PricingPlan`, `Menu` models to `prisma/schema.prisma`
- [ ] Add `addresses` + `messProviders` relation fields to `User` model
- [ ] `npx prisma migrate dev --name phase2_mess_menu_pricing`
- [ ] Edit generated migration file — add PostGIS extension + `location` GENERATED column + GIST index
- [ ] `npx prisma generate` — regenerate client with new models
- [ ] Verify new types available in `src/generated/prisma/client.ts`

### 7.2 User Module
- [ ] `user.types.ts` — `UpdateUserDto`, `CreateAddressDto`, `UpdateAddressDto`
- [ ] `user.schema.ts` — `updateUserSchema`, `createAddressSchema`, `updateAddressSchema`
- [ ] `user.repository.ts` (imports from `../../generated/prisma/client.js`):
  - `findById(id)` → `prisma.user.findUnique`
  - `update(id, data)` → `prisma.user.update`
  - `createAddress(userId, data)` → `prisma.$transaction`: unset defaults if `isDefault`, then `prisma.address.create`
  - `findAddresses(userId)` → `prisma.address.findMany` ordered by `isDefault desc`
  - `updateAddress(id, userId, data)` → verify ownership + update; `isDefault` toggle in transaction
  - `deleteAddress(id, userId)` → `prisma.address.delete({ where: { id, userId } })`
- [ ] `user.service.ts` — delegate to repository
- [ ] `user.controller.ts` — 6 handlers
- [ ] `user.routes.ts` — all `authenticate`-protected

### 7.3 Mess Module
- [ ] `mess.types.ts` — `MessWithDistance`, `CreateMessDto`, `GetNearbyQuery`, `UpsertPlanDto`
- [ ] `mess.schema.ts` — `createMessSchema`, `updateMessSchema`, `getNearbySchema`, `upsertPlanSchema`
- [ ] `mess.repository.ts` — `findNearby` (`$queryRaw`), `findById`, `create`, `update`, `findPlansByMess`, `upsertPlan` — all as shown in Section 3
- [ ] `mess.service.ts`:
  - `getNearby(params)` — check Redis; on miss call `findNearby`; cache 300s
  - `getById(id)` — check Redis; on miss call `findById`; cache 600s
  - `registerMess(userId, data)` — verify `req.user.role === 'mess_owner'`
  - `updateMess(id, userId, data)` — verify ownership; update; invalidate Redis keys
  - `upsertPlan(messId, userId, data)` — verify ownership
- [ ] `mess.controller.ts` — 6 handlers
- [ ] `mess.routes.ts`

### 7.4 Menu Module
- [ ] `menu.types.ts` — `MenuItem`, `UpsertMenuDto`
- [ ] `menu.schema.ts` — `upsertMenuSchema`, `getMenuRangeSchema`
- [ ] `menu.repository.ts`:
  - `findByMessAndDate(messId, date)` → `prisma.menu.findMany`
  - `findByDateRange(messId, from, to)` → `prisma.menu.findMany({ where: { date: { gte, lte } } })`
  - `upsert(messId, data)` → `prisma.menu.upsert` using `@@unique` compound key
  - `deleteById(menuId, messId)` → `prisma.menu.delete({ where: { id: menuId, messId } })`
- [ ] `menu.service.ts` — cache get/invalidate, ownership checks, range validation (max 7 days)
- [ ] `menu.controller.ts` — 4 handlers
- [ ] `menu.routes.ts`

### 7.5 Error Codes (append to `errorCodes.ts`)
```typescript
MESS_NOT_FOUND:      'MESS_NOT_FOUND',
MESS_NOT_ACTIVE:     'MESS_NOT_ACTIVE',
MESS_OWNER_MISMATCH: 'MESS_OWNER_MISMATCH',
PLAN_NOT_FOUND:      'PLAN_NOT_FOUND',
```

### 7.6 App Registration
- [ ] Register `userRoutes`, `messRoutes`, `menuRoutes` in `src/app.ts`

### 7.6 OpenAPI
- [ ] Add `Address`, `MessProvider`, `MessWithDistance`, `PricingPlan`, `MenuItem`, `Menu` schemas to `src/config/swagger.ts`
- [ ] Add `@openapi` JSDoc blocks to `user.routes.ts` — GET/PATCH `/users/me`, GET/POST `/users/me/addresses`
- [ ] Add `@openapi` JSDoc blocks to `mess.routes.ts` — GET `/mess-providers`, GET/POST `/mess-providers/{id}`, POST `/mess-providers/{id}/plans`
- [ ] Add `@openapi` JSDoc blocks to `menu.routes.ts` — GET `/menus/today`, PUT `/menus`
- [ ] Verify all new endpoints appear in Swagger UI at `/api/docs`

### 7.7 Tests
- [ ] `tests/unit/mess/mess.service.test.ts` — cache hit/miss, ownership check on update
- [ ] `tests/unit/mess/mess.repository.test.ts` — mock `prisma.$queryRaw`, verify tagged template params
- [ ] `tests/integration/mess.routes.test.ts` — register mess → get nearby → get detail
- [ ] `tests/integration/menu.routes.test.ts` — upsert menu → get today → verify cache set
