# Hungrygo — Phase 5: Admin Panel, Notifications & Growth
> **LLM Instruction:** Phases 1–4 complete. Append new models to `prisma/schema.prisma`. Run `prisma migrate dev` + `prisma generate`. BullMQ workers use Prisma directly (documented exception to the repository pattern). Import types from `../../generated/prisma/client.js`. All Redis keys use `hungrygo:` prefix.

---

## 1. PRD Summary

### Goal
Complete the Hungrygo platform with admin KYC panel, async notification system (BullMQ + FCM), subscription auto-renewal, promo codes, and analytics.

### Scope (Phase 5 only)
- Append to `prisma/schema.prisma`: `NotificationToken`, `Notification`, `PromoCode`, `PromoUsage` models
- Modify `Subscription`: add `promoId` + `discountAmount` fields
- Admin: mess KYC approval/suspension, user management, review moderation, analytics
- BullMQ job queues: `notificationQueue`, `renewalQueue` (using shared ioredis connection)
- BullMQ workers: FCM push + SMS dispatch; auto-renewal processing
- Cron schedulers: meal reminders (7 AM), renewal checks (11 PM)
- In-app notifications: list, mark read, register FCM token
- Promo codes: validate + apply discount atomically on subscription create
- Platform analytics API (admin only): GMV, MAU, top messes

### Out of Scope
Native mobile app, B2B plans — post-MVP.

### Success Criteria
- Mess goes live only after admin sets `status = 'active'`
- BullMQ processes FCM jobs async; API never blocks on notification dispatch
- Promo usage is atomic: `prisma.$transaction` INSERT promo_usage + INCR used_count
- All Redis keys prefixed with `hungrygo:`

---

## 2. Prisma Schema — Phase 5 Additions

### Append to `prisma/schema.prisma`

```prisma
// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5 ENUMS
// ─────────────────────────────────────────────────────────────────────────────

enum NotificationType {
  meal_reminder
  menu_updated
  sub_renewal_reminder
  sub_activated
  sub_cancelled
  payment_captured
  payment_failed
  mess_approved
  mess_suspended
}

enum NotificationPlatform {
  web
  android
  ios
}

enum PromoDiscountType {
  flat
  percent
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5 MODELS
// ─────────────────────────────────────────────────────────────────────────────

model NotificationToken {
  id        String               @id @default(uuid()) @db.Uuid
  userId    String               @map("user_id") @db.Uuid
  token     String               @unique
  platform  NotificationPlatform
  isActive  Boolean              @default(true) @map("is_active")
  createdAt DateTime             @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("notification_tokens")
}

model Notification {
  id        String           @id @default(uuid()) @db.Uuid
  userId    String           @map("user_id") @db.Uuid
  type      NotificationType
  title     String           @db.VarChar(150)
  body      String
  payload   Json             @default("{}")
  isRead    Boolean          @default(false) @map("is_read")
  sentAt    DateTime?        @map("sent_at")
  readAt    DateTime?        @map("read_at")
  createdAt DateTime         @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([userId, isRead])
  @@map("notifications")
}

model PromoCode {
  id             String            @id @default(uuid()) @db.Uuid
  code           String            @unique @db.VarChar(20)
  description    String?
  discountType   PromoDiscountType @map("discount_type")
  discountValue  Decimal           @map("discount_value") @db.Decimal(10, 2)
  maxUses        Int?              @map("max_uses")
  usedCount      Int               @default(0) @map("used_count")
  minOrderAmount Decimal           @default(0) @map("min_order_amount") @db.Decimal(10, 2)
  validFrom      DateTime          @default(now()) @map("valid_from")
  validUntil     DateTime?         @map("valid_until")
  isActive       Boolean           @default(true) @map("is_active")
  createdAt      DateTime          @default(now()) @map("created_at")

  usages PromoUsage[]

  @@map("promo_codes")
}

model PromoUsage {
  id             String   @id @default(uuid()) @db.Uuid
  promoId        String   @map("promo_id") @db.Uuid
  userId         String   @map("user_id") @db.Uuid
  subscriptionId String   @map("subscription_id") @db.Uuid
  discountAmount Decimal  @map("discount_amount") @db.Decimal(10, 2)
  createdAt      DateTime @default(now()) @map("created_at")

  promo        PromoCode    @relation(fields: [promoId],        references: [id])
  user         User         @relation(fields: [userId],         references: [id])
  subscription Subscription @relation(fields: [subscriptionId], references: [id])

  @@unique([userId, promoId])
  @@index([promoId])
  @@map("promo_usages")
}
```

### Append relation fields to existing models
```prisma
// In Subscription model add:
promoId        String?    @map("promo_id") @db.Uuid
discountAmount Decimal    @default(0) @map("discount_amount") @db.Decimal(10, 2)
promo          PromoCode? @relation(fields: [promoId], references: [id])
promoUsages    PromoUsage[]

// In User model add:
notificationTokens NotificationToken[]
notifications      Notification[]
promoUsages        PromoUsage[]
```

### Raw Migration Additions
```sql
ALTER TABLE subscriptions
  ADD COLUMN promo_id UUID REFERENCES promo_codes(id),
  ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
```

### Redis Keys (Phase 5)

| Key Pattern | TTL | Type | Purpose |
|---|---|---|---|
| `hungrygo:analytics:{from}:{to}` | 3600s | JSON | Cached admin analytics |
| `hungrygo:notif:dedup:{jobId}` | 86400s | String | Job deduplication |

---

## 3. Folder & File Structure

```
src/
├── modules/
│   │
│   ├── admin/                          # NEW
│   │   ├── admin.routes.ts
│   │   ├── admin.controller.ts
│   │   ├── admin.service.ts
│   │   ├── admin.repository.ts         # prisma aggregations, status updates
│   │   └── admin.types.ts
│   │
│   ├── notification/                   # NEW
│   │   ├── notification.routes.ts
│   │   ├── notification.controller.ts
│   │   ├── notification.service.ts     # enqueues BullMQ jobs — never sends directly
│   │   ├── notification.repository.ts  # prisma.notification, prisma.notificationToken
│   │   └── notification.types.ts
│   │
│   └── promo/                          # NEW
│       ├── promo.routes.ts
│       ├── promo.controller.ts
│       ├── promo.service.ts
│       ├── promo.repository.ts         # prisma.$transaction: apply + INCR usedCount
│       ├── promo.schema.ts
│       └── promo.types.ts
│
├── jobs/                               # NEW — BullMQ infrastructure
│   ├── queues.ts                       # Queue instances using shared ioredis
│   ├── workers/
│   │   ├── notification.worker.ts      # FCM + SMS — uses prisma directly (documented exception)
│   │   └── renewal.worker.ts           # Auto-renewal — uses prisma directly
│   └── schedulers/
│       ├── mealReminder.scheduler.ts   # Cron: 0 7 * * *
│       └── renewalCheck.scheduler.ts   # Cron: 0 23 * * *
│
├── modules/subscription/
│   └── subscription.service.ts         # MODIFY: accept optional promoCode param
│
└── shared/errors/
    └── errorCodes.ts                   # APPEND Phase 5 codes
```

### BullMQ Setup (Prisma 7 Compatible)
```typescript
// src/jobs/queues.ts
import { Queue } from 'bullmq';
import redis from '../config/redis.js';  // shared ioredis instance — Prisma 7 ESM import

export const notificationQueue = new Queue('hungrygo:notifications', {
  connection: redis,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
});

export const renewalQueue = new Queue('hungrygo:renewals', {
  connection: redis,
  defaultJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 60000 } },
});
```

```typescript
// src/jobs/workers/notification.worker.ts
// DOCUMENTED EXCEPTION: Workers use prisma + firebase-admin directly
// No controller/service/repo layer — background jobs have no HTTP context
import { Worker } from 'bullmq';
import prisma from '../../config/database.js';
import redis from '../../config/redis.js';
import admin from 'firebase-admin';
import logger from '../../config/logger.js';

const worker = new Worker('hungrygo:notifications', async (job) => {
  const { userIds, title, body, payload, notificationIds } = job.data;

  const tokens = await prisma.notificationToken.findMany({
    where: { userId: { in: userIds }, isActive: true },
    select: { token: true, userId: true },
  });

  if (tokens.length > 0) {
    const result = await admin.messaging().sendEachForMulticast({
      tokens: tokens.map(t => t.token),
      notification: { title, body },
      data: payload,
    });

    // Deactivate invalid tokens
    const invalidTokens = result.responses
      .map((r, i) => ({ ...r, token: tokens[i].token }))
      .filter(r => !r.success &&
        r.error?.code === 'messaging/registration-token-not-registered');

    if (invalidTokens.length > 0) {
      await prisma.notificationToken.updateMany({
        where: { token: { in: invalidTokens.map(t => t.token) } },
        data:  { isActive: false },
      });
    }
  }

  // Mark as sent
  if (notificationIds?.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: notificationIds } },
      data:  { sentAt: new Date() },
    });
  }
}, { connection: redis });

worker.on('failed', (job, err) =>
  logger.error('[Hungrygo] Notification job failed', { jobId: job?.id, err }));

export default worker;
```

---

## 4. API Endpoints

### Base URL: `/api/v1`

---

### 4.1 Admin Module

#### GET `/admin/mess-providers` — Auth: Bearer (`admin`)
**Query Params:** `status`, `city`, `cursor`, `limit`

**Prisma Query:**
```typescript
prisma.messProvider.findMany({
  where: { ...(status !== 'all' && { status }), ...(city && { city }) },
  include: { owner: { select: { id: true, name: true, phone: true } } },
  orderBy: { createdAt: 'desc' },
})
```

---

#### PATCH `/admin/mess-providers/:id/approve` — Auth: Bearer (`admin`)
**Request Body:** `{ "notes": "FSSAI verified." }`
**Business Logic:** `prisma.messProvider.update({ status: 'active' })` → enqueue notification to owner
**Success `200`** — updated mess

---

#### PATCH `/admin/mess-providers/:id/suspend` — Auth: Bearer (`admin`)
**Request Body:** `{ "reason": "Hygiene complaints" }`
**Business Logic:** `prisma.$transaction` — update mess + `updateMany` active subscriptions to `cancelled` → notify owner

---

#### GET `/admin/users` — Auth: Bearer (`admin`)
**Query Params:** `role`, `isActive`, `cursor`, `limit`

---

#### PATCH `/admin/users/:id/deactivate` — Auth: Bearer (`admin`)
```typescript
prisma.user.update({ where: { id }, data: { isActive: false } })
```

---

#### GET `/admin/reviews` — Auth: Bearer (`admin`)
**Query Params:** `isVisible`, `cursor`, `limit`

---

#### PATCH `/admin/reviews/:id/hide` — Auth: Bearer (`admin`)
**Business Logic:** `prisma.$transaction` — set `isVisible = false` + recalculate mess `avgRating`

---

#### GET `/admin/analytics` — Auth: Bearer (`admin`)
**Query Params:** `from=YYYY-MM-DD`, `to=YYYY-MM-DD`
**Redis Cache:** `hungrygo:analytics:{from}:{to}` TTL 3600s

**Prisma `$queryRaw` aggregations:**
```typescript
// GMV
const [gmv] = await prisma.$queryRaw<[{ gmv: number }]>`
  SELECT COALESCE(SUM(amount), 0)::float AS gmv
  FROM payments WHERE status = 'captured'
  AND created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz
`;

// Top messes
const topMesses = await prisma.$queryRaw`
  SELECT mp.id AS mess_id, mp.name,
    COUNT(s.id)::int    AS subscriptions,
    SUM(p.amount)::float AS revenue
  FROM subscriptions s
  JOIN mess_providers mp ON mp.id = s.mess_id
  JOIN payments p ON p.subscription_id = s.id AND p.status = 'captured'
  WHERE s.created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz
  GROUP BY mp.id, mp.name ORDER BY revenue DESC LIMIT 10
`;
```

**Success `200`**
```json
{
  "success": true,
  "data": {
    "period": { "from": "2026-04-01", "to": "2026-04-30" },
    "gmv": 450000, "totalSubscriptions": 210, "newUsers": 185,
    "activeUsers": 320, "churnedSubscriptions": 18,
    "topMesses": [{ "messId": "uuid", "name": "Sunita Tiffin Center", "subscriptions": 42, "revenue": 92400 }]
  }
}
```

---

#### POST `/admin/promo-codes` — Auth: Bearer (`admin`)
**Request Body:**
```json
{
  "code": "WELCOME100", "discountType": "flat", "discountValue": 100,
  "maxUses": 1000, "minOrderAmount": 500,
  "validFrom": "2026-04-01T00:00:00Z", "validUntil": "2026-04-30T23:59:59Z"
}
```
**Success `201`** — `prisma.promoCode.create(...)`

---

### 4.2 Notifications

#### GET `/notifications` — Auth: Bearer
**Query Params:** `isRead`, `cursor`, `limit` (default 20)

**Prisma Query:**
```typescript
prisma.notification.findMany({
  where: { userId, ...(isRead !== undefined && { isRead }) },
  orderBy: { createdAt: 'desc' },
  take: limit, cursor: cursor ? { id: cursor } : undefined, skip: cursor ? 1 : 0,
})
```

**Success `200`**
```json
{
  "success": true,
  "data": [{ "id": "uuid", "type": "meal_reminder", "title": "Lunch is today!", "body": "...", "isRead": false, "createdAt": "..." }],
  "meta": { "unreadCount": 3, "cursor": "xyz", "has_more": false }
}
```

---

#### PATCH `/notifications/:id/read` — Auth: Bearer
```typescript
prisma.notification.update({ where: { id, userId }, data: { isRead: true, readAt: new Date() } })
```

---

#### PATCH `/notifications/read-all` — Auth: Bearer
```typescript
prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true, readAt: new Date() } })
```

---

#### POST `/notifications/token` — Auth: Bearer
**Request Body:** `{ "token": "fcm_token_string", "platform": "web" }`
```typescript
prisma.notificationToken.upsert({
  where:  { token },
  update: { isActive: true, userId },
  create: { userId, token, platform },
})
```

---

### 4.3 Promo Codes

#### GET `/promo/validate` — Auth: Bearer
**Query Params:** `code`, `amount`

**Validation Logic (Service):**
1. `prisma.promoCode.findUnique({ where: { code, isActive: true } })` → `PROMO_NOT_FOUND`
2. `validUntil && new Date() > promo.validUntil` → `PROMO_EXPIRED`
3. `promo.maxUses && promo.usedCount >= promo.maxUses` → `PROMO_EXHAUSTED`
4. `prisma.promoUsage.findUnique({ where: { userId_promoId: { userId, promoId: promo.id } } })` → `PROMO_ALREADY_USED`
5. `amount < promo.minOrderAmount` → `PROMO_MIN_ORDER`
6. `discountAmount = type === 'flat' ? discountValue : amount * discountValue / 100`

**Success `200`**
```json
{ "success": true, "data": { "valid": true, "code": "WELCOME100", "discountAmount": 100, "finalAmount": 2100 } }
```

**Errors:** `PROMO_NOT_FOUND` 404 · `PROMO_EXPIRED` 422 · `PROMO_EXHAUSTED` 422 · `PROMO_ALREADY_USED` 409 · `PROMO_MIN_ORDER` 422

---

### 4.4 Modified: POST `/subscriptions`
**Accept optional `promoCode` field:**
```typescript
// In subscription.service.ts — if promoCode provided:
const promoResult = await promoService.validatePromo(promoCode, userId, planPrice);
// Apply discount — pass promoId + discountAmount to subscription INSERT + promoRepository.apply(...)
```
**Promo Apply (atomic):**
```typescript
// promo.repository.ts
prisma.$transaction(async (tx) => {
  await tx.promoUsage.create({ data: { promoId, userId, subscriptionId, discountAmount } });
  await tx.promoCode.update({ where: { id: promoId }, data: { usedCount: { increment: 1 } } });
})
```

---

## 5. Cron Schedulers

### mealReminder.scheduler.ts — `0 7 * * *`
```typescript
import { CronJob } from 'cron';
import prisma from '../../config/database.js';
import { notificationQueue } from '../queues.js';

new CronJob('0 7 * * *', async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const slots = await prisma.subscriptionMealSlot.findMany({
    where: { date: today, status: 'scheduled' },
    include: { subscription: { include: { mess: { select: { name: true } }, user: true } } },
    distinct: ['subscriptionId'],
  });

  // Group by userId
  const byUser = new Map<string, typeof slots>();
  for (const s of slots) {
    const uid = s.subscription.userId;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push(s);
  }

  for (const [userId, userSlots] of byUser) {
    const messName = userSlots[0].subscription.mess.name;
    await notificationQueue.add('meal_reminder', {
      userIds: [userId],
      title: 'Your meal is today! 🍛',
      body: `Your meal at ${messName} is scheduled. Tap to manage.`,
      payload: { type: 'meal_reminder' },
    });
  }
}, null, true);
```

### renewalCheck.scheduler.ts — `0 23 * * *`
```typescript
new CronJob('0 23 * * *', async () => {
  const in3Days = new Date();
  in3Days.setDate(in3Days.getDate() + 3);
  in3Days.setHours(0, 0, 0, 0);

  // Renewal reminders
  const expiringSoon = await prisma.subscription.findMany({
    where: { endDate: in3Days, autoRenew: true, status: 'active' },
  });
  for (const sub of expiringSoon) {
    await notificationQueue.add('renewal_reminder', { userIds: [sub.userId], subscriptionId: sub.id });
  }

  // Auto-renew for expired
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const expired = await prisma.subscription.findMany({
    where: { endDate: yesterday, autoRenew: true, status: 'active' },
  });
  for (const sub of expired) {
    await renewalQueue.add('auto_renew', { subscriptionId: sub.id, userId: sub.userId });
  }
}, null, true);
```

---

## 6. OpenAPI Documentation

> **Setup complete from Phase 1.** Add JSDoc `@openapi` blocks to new route files only.

### New Schemas (append to `src/config/swagger.ts` → `components.schemas`)

```typescript
Notification: {
  type: 'object',
  properties: {
    id:        { type: 'string', format: 'uuid' },
    type:      { type: 'string', example: 'meal_reminder' },
    title:     { type: 'string', example: 'Your meal is today! 🍛' },
    body:      { type: 'string' },
    isRead:    { type: 'boolean' },
    sentAt:    { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
},
PromoCode: {
  type: 'object',
  properties: {
    id:            { type: 'string', format: 'uuid' },
    code:          { type: 'string', example: 'WELCOME100' },
    discountType:  { type: 'string', enum: ['flat', 'percent'] },
    discountValue: { type: 'number', example: 100 },
    maxUses:       { type: 'integer', nullable: true },
    usedCount:     { type: 'integer' },
    validUntil:    { type: 'string', format: 'date-time', nullable: true },
    isActive:      { type: 'boolean' },
  },
},
AnalyticsData: {
  type: 'object',
  properties: {
    period:               { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
    gmv:                  { type: 'number', example: 450000 },
    totalSubscriptions:   { type: 'integer', example: 210 },
    newUsers:             { type: 'integer', example: 185 },
    activeUsers:          { type: 'integer', example: 320 },
    churnedSubscriptions: { type: 'integer', example: 18 },
    topMesses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          messId:        { type: 'string' },
          name:          { type: 'string' },
          subscriptions: { type: 'integer' },
          revenue:       { type: 'number' },
        },
      },
    },
  },
},
```

---

### Notification Routes (`notification.routes.ts`)

```typescript
/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List in-app notifications
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isRead
 *         schema: { type: boolean }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Notification list with unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Notification' }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     unreadCount: { type: integer }
 *                     cursor:      { type: string, nullable: true }
 *                     has_more:    { type: boolean }
 *
 * /notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark a notification as read
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: 'Marked as read' }
 *
 * /notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     markedCount: { type: integer, example: 3 }
 *
 * /notifications/token:
 *   post:
 *     tags: [Notifications]
 *     summary: Register FCM device token
 *     description: Upserts the FCM token for the current user and platform.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, platform]
 *             properties:
 *               token:    { type: string, example: 'fcm_device_token_string' }
 *               platform: { type: string, enum: [web, android, ios] }
 *     responses:
 *       200:
 *         description: Token registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: 'Token registered' }
 */
```

---

### Promo Routes (`promo.routes.ts`)

```typescript
/**
 * @openapi
 * /promo/validate:
 *   get:
 *     tags: [Promo]
 *     summary: Validate a promo code
 *     description: >
 *       Checks eligibility of a promo code for the current user and order amount.
 *       Does not apply the code — call POST /subscriptions with promoCode to apply.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema: { type: string, example: 'WELCOME100' }
 *       - in: query
 *         name: amount
 *         required: true
 *         schema: { type: number, example: 2200 }
 *     responses:
 *       200:
 *         description: Promo valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     valid:          { type: boolean, example: true }
 *                     code:           { type: string }
 *                     discountType:   { type: string }
 *                     discountValue:  { type: number }
 *                     discountAmount: { type: number, example: 100 }
 *                     finalAmount:    { type: number, example: 2100 }
 *       404:
 *         description: Promo not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               error: { code: 'PROMO_NOT_FOUND', message: 'Promo code not found.' }
 *       422:
 *         description: Promo expired or exhausted
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             examples:
 *               expired:
 *                 value: { success: false, error: { code: 'PROMO_EXPIRED', message: 'This promo code has expired.' } }
 *               exhausted:
 *                 value: { success: false, error: { code: 'PROMO_EXHAUSTED', message: 'This promo code has reached its usage limit.' } }
 *               minOrder:
 *                 value: { success: false, error: { code: 'PROMO_MIN_ORDER', message: 'Minimum order amount not met.' } }
 *       409:
 *         description: Promo already used by this user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
```

---

### Admin Routes (`admin.routes.ts`)

```typescript
/**
 * @openapi
 * /admin/mess-providers:
 *   get:
 *     tags: [Admin]
 *     summary: List all mess providers (admin)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, active, suspended, all], default: all }
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Mess provider list with owner info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/MessProvider' } }
 *
 * /admin/mess-providers/{id}/approve:
 *   patch:
 *     tags: [Admin]
 *     summary: Approve a pending mess provider
 *     description: Sets status to `active`. Sends push notification to owner.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes: { type: string, example: 'FSSAI verified.' }
 *     responses:
 *       200:
 *         description: Mess approved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/MessProvider' }
 *
 * /admin/mess-providers/{id}/suspend:
 *   patch:
 *     tags: [Admin]
 *     summary: Suspend a mess provider
 *     description: Sets status to `suspended` and cancels all active subscriptions.
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
 *             required: [reason]
 *             properties:
 *               reason: { type: string, example: 'Hygiene complaints' }
 *     responses:
 *       200:
 *         description: Mess suspended
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *
 * /admin/analytics:
 *   get:
 *     tags: [Admin]
 *     summary: Platform analytics
 *     description: GMV, subscriber counts, top messes. Cached in Redis for 1 hour.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema: { type: string, format: date, example: '2026-04-01' }
 *       - in: query
 *         name: to
 *         required: true
 *         schema: { type: string, format: date, example: '2026-04-30' }
 *     responses:
 *       200:
 *         description: Analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/AnalyticsData' }
 *
 * /admin/promo-codes:
 *   post:
 *     tags: [Admin]
 *     summary: Create a promo code
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, discountType, discountValue]
 *             properties:
 *               code:           { type: string, example: 'WELCOME100' }
 *               description:    { type: string }
 *               discountType:   { type: string, enum: [flat, percent] }
 *               discountValue:  { type: number, example: 100 }
 *               maxUses:        { type: integer, nullable: true, example: 1000 }
 *               minOrderAmount: { type: number, example: 500 }
 *               validFrom:      { type: string, format: date-time }
 *               validUntil:     { type: string, format: date-time, nullable: true }
 *     responses:
 *       201:
 *         description: Promo code created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/PromoCode' }
 */
```

---

## 7. Frontend Pages (Minimal Reference)

| Page | Route | Description |
|---|---|---|
| Notifications | `/notifications` | In-app notification list |
| Admin: Mess Approvals | `/admin/mess` | KYC queue |
| Admin: Users | `/admin/users` | User management |
| Admin: Reviews | `/admin/reviews` | Moderation |
| Admin: Analytics | `/admin/analytics` | GMV, charts |

---

## 8. Tasks & Subtasks Checklist

### 8.1 Prisma Schema & Migration
- [ ] Append Phase 5 enums + `NotificationToken`, `Notification`, `PromoCode`, `PromoUsage` models
- [ ] Add relation fields to `Subscription`, `User`
- [ ] `npx prisma migrate dev --name phase5_notifications_promo`
- [ ] Edit generated migration: ADD promo columns to subscriptions
- [ ] `npx prisma generate`

### 8.2 BullMQ Infrastructure
- [ ] Install: `bullmq`, `firebase-admin`, `cron`
- [ ] `src/jobs/queues.ts` — `notificationQueue` + `renewalQueue` with shared `redis` connection
- [ ] `src/jobs/workers/notification.worker.ts` — FCM multicast + invalid token cleanup (as shown in Section 3)
- [ ] `src/jobs/workers/renewal.worker.ts` — fetch sub → create new sub → call Razorpay → on failure notify user + set `autoRenew = false`
- [ ] `src/jobs/schedulers/mealReminder.scheduler.ts` — cron `0 7 * * *`
- [ ] `src/jobs/schedulers/renewalCheck.scheduler.ts` — cron `0 23 * * *`
- [ ] `src/server.ts` — start workers + schedulers after DB/Redis connections ready

### 8.3 Notification Module
- [ ] `notification.types.ts` — `SendNotificationDto`, `RegisterTokenDto`
- [ ] `notification.repository.ts`:
  - `create(data)` → `prisma.notification.create`
  - `findByUser(userId, opts)` — cursor paginated, include unread count
  - `markRead(id, userId)`, `markAllRead(userId)`
  - `getActiveTokens(userId)` → `prisma.notificationToken.findMany({ where: { userId, isActive: true } })`
  - `upsertToken(userId, token, platform)` → `prisma.notificationToken.upsert`
- [ ] `notification.service.ts`:
  - `send(userId, type, title, body, payload)` → INSERT notification → `notificationQueue.add`
- [ ] `notification.controller.ts` — 5 handlers, `notification.routes.ts`
- [ ] Integrate `notification.service.send()` into:
  - [ ] `subscription.service` — on activation + cancel
  - [ ] `payment.service` — on captured + failed
  - [ ] `menu.service` — on menu update (notify active subscribers)

### 8.4 Promo Module
- [ ] `promo.types.ts` — `ValidatePromoResult`, `ApplyPromoDto`
- [ ] `promo.schema.ts` — `validatePromoQuerySchema`, `createPromoSchema`
- [ ] `promo.repository.ts`:
  - `findByCode(code)` → `prisma.promoCode.findUnique({ where: { code } })`
  - `checkUsage(promoId, userId)` → `prisma.promoUsage.findUnique({ where: { userId_promoId: { userId, promoId } } })`
  - `applyPromo(...)` → `prisma.$transaction`: INSERT promoUsage + UPDATE promoCode `usedCount: { increment: 1 }`
- [ ] `promo.service.ts` — all eligibility checks → `validatePromo`, `applyPromo`
- [ ] `promo.controller.ts`, `promo.routes.ts`
- [ ] Modify `subscription.service.ts` — accept optional `promoCode`; call `promo.service.validatePromo`; pass `promoId + discountAmount` to subscription INSERT

### 8.5 Admin Module
- [ ] `admin.repository.ts`:
  - `getPendingMesses(opts)`, `approveMess(id)`, `suspendMess(id, reason)` (with `$transaction`)
  - `getUsers(opts)`, `deactivateUser(id)`
  - `getReviewsForModeration(opts)`, `hideReview(id)` (with `$transaction` for rating recalc)
  - `getAnalytics(from, to)` — multiple `$queryRaw` aggregations as shown in Section 4
- [ ] `admin.service.ts` — approve/suspend + notify owner; analytics Redis cache
- [ ] `admin.controller.ts` — 8 handlers
- [ ] `admin.routes.ts` — `authenticate` + `authorize('admin')`

### 8.6 Error Codes (append)
```typescript
PROMO_NOT_FOUND:    'PROMO_NOT_FOUND',
PROMO_EXPIRED:      'PROMO_EXPIRED',
PROMO_EXHAUSTED:    'PROMO_EXHAUSTED',
PROMO_ALREADY_USED: 'PROMO_ALREADY_USED',
PROMO_MIN_ORDER:    'PROMO_MIN_ORDER',
```

### 8.7 App Registration
- [ ] Register `notificationRoutes`, `promoRoutes`, `adminRoutes` in `src/app.ts`
- [ ] Start workers + schedulers in `src/server.ts` after connections ready

### 8.7 OpenAPI
- [ ] Append `Notification`, `PromoCode`, `AnalyticsData` schemas to `src/config/swagger.ts`
- [ ] Add `@openapi` JSDoc blocks to `notification.routes.ts` — GET `/notifications`, PATCH `/{id}/read`, PATCH `/read-all`, POST `/token`
- [ ] Add `@openapi` JSDoc blocks to `promo.routes.ts` — GET `/promo/validate`
- [ ] Add `@openapi` JSDoc blocks to `admin.routes.ts` — GET/PATCH mess, GET users, GET analytics, POST promo-codes
- [ ] Verify Admin, Notifications, Promo tags appear in Swagger UI
- [ ] Final check: all routes across phases visible in Swagger UI — total endpoint count matches API reference

### 8.8 Tests
- [ ] `promo.service.test.ts` — expired, exhausted, double-use, flat vs percent discount
- [ ] `notification.service.test.ts` — job enqueued on send, token upsert
- [ ] `admin.service.test.ts` — approve mess + notification triggered, analytics cache hit
- [ ] `notification.routes.test.ts` — register token → get unread → mark all read
- [ ] `promo.routes.test.ts` — validate → apply → verify PromoUsage + usedCount incremented
- [ ] `admin.routes.test.ts` — approve mess → status change + notification created
