# Hungrygo — Phase 3: Subscriptions & Meal Cancellation
> **LLM Instruction:** Phases 1–2 are complete. Append new models to `prisma/schema.prisma`. Run `prisma migrate dev` and `prisma generate` after schema changes. Use `prisma.$transaction` for all atomic multi-table operations. Import Prisma types from `../../generated/prisma/client.js`. Do not recreate earlier files.

---

## 1. PRD Summary

### Goal
Allow customers to subscribe to a mess for a specific meal slot and duration. Auto-generate individual `MealSlot` rows for every day in the window. Allow customers to cancel individual meals (receive wallet credits) or pause/cancel their full subscription.

### Scope (Phase 3 only)
- Append to `prisma/schema.prisma`: `Subscription`, `SubscriptionMealSlot`, `CreditWallet`, `WalletTransaction` models
- Create subscription → generate all `SubscriptionMealSlot` rows in one `prisma.$transaction`
- List, view, pause, and cancel subscriptions
- Cancel individual meal slot (24-hour window check) → credit wallet atomically
- Wallet: view balance + transaction history
- Redis headcount: INCR/DECR per mess per date per slot
- **Note:** In Phase 3, subscription status goes directly to `active` (no payment gate). Phase 4 adds `pending_payment`.

### Out of Scope
Razorpay payment processing — Phase 4.

### Success Criteria
- Subscription creation generates all `SubscriptionMealSlot` rows in one `prisma.$transaction`
- Cancelling a meal slot < 24 hours ahead returns `MEAL_SLOT_WINDOW_EXPIRED` 422
- Cancelling within window credits wallet atomically via `prisma.$transaction`
- Wallet balance never goes below 0 (enforced by raw migration CHECK constraint)
- One active subscription per `(userId, messId, mealSlot)` enforced via partial unique index

---

## 2. Prisma Schema — Phase 3 Additions

### Append to `prisma/schema.prisma`

```prisma
// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 ENUMS
// ─────────────────────────────────────────────────────────────────────────────

enum SubStatus {
  pending_payment
  active
  paused
  cancelled
  expired
}

enum MealSlotStatus {
  scheduled
  delivered
  cancelled
  skipped
}

enum WalletTxType {
  credit
  debit
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 MODELS
// ─────────────────────────────────────────────────────────────────────────────

model Subscription {
  id           String       @id @default(uuid()) @db.Uuid
  userId       String       @map("user_id") @db.Uuid
  messId       String       @map("mess_id") @db.Uuid
  planId       String       @map("plan_id") @db.Uuid
  mealSlot     MealSlot     @map("meal_slot")
  durationType DurationType @map("duration_type")
  startDate    DateTime     @map("start_date") @db.Date
  endDate      DateTime     @map("end_date") @db.Date
  status       SubStatus    @default(active)
  autoRenew    Boolean      @default(true)  @map("auto_renew")
  totalAmount  Decimal      @map("total_amount") @db.Decimal(10, 2)
  pauseStart   DateTime?    @map("pause_start") @db.Date
  pauseEnd     DateTime?    @map("pause_end") @db.Date
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt      @map("updated_at")

  user      User         @relation(fields: [userId], references: [id], onDelete: Restrict)
  mess      MessProvider @relation(fields: [messId], references: [id], onDelete: Restrict)
  plan      PricingPlan  @relation(fields: [planId], references: [id])
  mealSlots SubscriptionMealSlot[]

  @@index([userId])
  @@index([messId])
  @@index([status])
  // Partial unique index (one active sub per user+mess+slot) added via raw migration edit
  @@map("subscriptions")
}

model SubscriptionMealSlot {
  id             String         @id @default(uuid()) @db.Uuid
  subscriptionId String         @map("subscription_id") @db.Uuid
  date           DateTime       @db.Date
  mealSlot       MealSlot       @map("meal_slot")
  status         MealSlotStatus @default(scheduled)
  cancelledAt    DateTime?      @map("cancelled_at")
  cancelReason   String?        @map("cancel_reason")
  creditIssued   Decimal        @default(0) @map("credit_issued") @db.Decimal(10, 2)
  createdAt      DateTime       @default(now()) @map("created_at")

  subscription Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@index([subscriptionId])
  @@index([date])
  @@index([status])
  @@map("meal_slots")
}

model CreditWallet {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @unique @map("user_id") @db.Uuid
  balance   Decimal  @default(0) @db.Decimal(10, 2)
  updatedAt DateTime @updatedAt @map("updated_at")

  user         User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions WalletTransaction[]

  @@map("credit_wallet")
}

model WalletTransaction {
  id          String       @id @default(uuid()) @db.Uuid
  userId      String       @map("user_id") @db.Uuid
  amount      Decimal      @db.Decimal(10, 2)
  type        WalletTxType
  reason      String?
  referenceId String?      @map("reference_id") @db.Uuid
  createdAt   DateTime     @default(now()) @map("created_at")

  user   User         @relation(fields: [userId], references: [id])
  wallet CreditWallet @relation(fields: [userId], references: [userId])

  @@index([userId])
  @@map("wallet_transactions")
}
```

### Append relation fields to existing models
```prisma
// In User model add:
subscriptions      Subscription[]
creditWallet       CreditWallet?
walletTransactions WalletTransaction[]

// In MessProvider model add:
subscriptions Subscription[]

// In PricingPlan model add:
subscriptions Subscription[]
```

### Raw Migration Additions
> After `prisma migrate dev`, edit the generated migration file to add:

```sql
-- Partial unique index: one ACTIVE subscription per user+mess+slot
CREATE UNIQUE INDEX idx_subs_active_unique
  ON subscriptions(user_id, mess_id, meal_slot)
  WHERE status = 'active';

-- Wallet balance never negative
ALTER TABLE credit_wallet
  ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);
```

### Redis Keys (Phase 3)

| Key Pattern | TTL | Type | Purpose |
|---|---|---|---|
| `hungrygo:headcount:{messId}:{YYYY-MM-DD}:{slot}` | 86400s | Counter | Live meal headcount |

---

## 3. Folder & File Structure

> Only new files. Earlier files unchanged except `prisma/schema.prisma` (append) and `src/app.ts` (add routes).

```
src/
├── modules/
│   │
│   ├── subscription/                   # NEW
│   │   ├── subscription.routes.ts
│   │   ├── subscription.controller.ts
│   │   ├── subscription.service.ts     # generates slots, runs $transaction
│   │   ├── subscription.repository.ts  # prisma.$transaction, createMany
│   │   ├── subscription.schema.ts
│   │   └── subscription.types.ts
│   │
│   ├── meal-slot/                      # NEW
│   │   ├── meal-slot.routes.ts
│   │   ├── meal-slot.controller.ts
│   │   ├── meal-slot.service.ts        # 24h window check, credit calc
│   │   ├── meal-slot.repository.ts     # atomic cancel + wallet update
│   │   ├── meal-slot.schema.ts
│   │   └── meal-slot.types.ts
│   │
│   └── wallet/                         # NEW
│       ├── wallet.routes.ts
│       ├── wallet.controller.ts
│       ├── wallet.service.ts
│       ├── wallet.repository.ts
│       └── wallet.types.ts
│
└── shared/errors/
    └── errorCodes.ts                   # APPEND Phase 3 codes
```

### Key Prisma 7 Transaction Patterns

```typescript
// subscription.service.ts — create subscription + bulk meal slots atomically
const result = await prisma.$transaction(async (tx) => {
  const sub = await tx.subscription.create({ data: { ...subData } });

  const slotRows = generateSlotDates(sub.startDate, sub.endDate, sub.mealSlot);
  await tx.subscriptionMealSlot.createMany({
    data: slotRows.map(s => ({ subscriptionId: sub.id, date: s.date, mealSlot: s.slot })),
  });

  // Ensure wallet exists
  await tx.creditWallet.upsert({
    where:  { userId: sub.userId },
    update: {},
    create: { userId: sub.userId, balance: 0 },
  });

  return sub;
});
```

```typescript
// meal-slot.service.ts — cancel slot + credit wallet atomically
const result = await prisma.$transaction(async (tx) => {
  await tx.subscriptionMealSlot.update({
    where: { id: slotId },
    data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason, creditIssued: creditAmount },
  });

  const wallet = await tx.creditWallet.update({
    where: { userId },
    data:  { balance: { increment: creditAmount } },
  });

  await tx.walletTransaction.create({
    data: { userId, amount: creditAmount, type: 'credit',
            reason: `Meal cancelled on ${slotDate}`, referenceId: slotId },
  });

  return wallet;
});
```

---

## 4. API Endpoints

### Base URL: `/api/v1`

---

### 4.1 Subscriptions

#### GET `/subscriptions` — Auth: Bearer
**Query Params:** `status` (`active|paused|cancelled|expired|all`), `cursor`, `limit` (default 10)

**Success `200`**
```json
{
  "success": true,
  "data": [{
    "id": "uuid",
    "mess": { "id": "uuid", "name": "Sunita Tiffin Center", "city": "Pune" },
    "mealSlot": "lunch", "durationType": "monthly",
    "startDate": "2026-04-01", "endDate": "2026-04-30",
    "status": "active", "autoRenew": true, "totalAmount": 2200,
    "cancelledSlots": 2, "totalSlots": 30
  }],
  "meta": { "cursor": "xyz", "has_more": false }
}
```

**Prisma Query:**
```typescript
prisma.subscription.findMany({
  where: { userId, ...(status !== 'all' && { status }) },
  include: {
    mess: { select: { id: true, name: true, city: true } },
    _count: { select: { mealSlots: { where: { status: 'cancelled' } } } },
  },
  orderBy: { createdAt: 'desc' },
})
```

---

#### POST `/subscriptions` — Auth: Bearer

**Request Body**
```json
{
  "messId": "uuid", "planId": "uuid",
  "mealSlot": "lunch", "durationType": "monthly",
  "startDate": "2026-04-01", "autoRenew": true
}
```

**Zod Schema**
```typescript
z.object({ body: z.object({
  messId:       z.string().uuid(),
  planId:       z.string().uuid(),
  mealSlot:     z.enum(['breakfast','lunch','dinner','full_day']),
  durationType: z.enum(['daily','weekly','monthly']),
  startDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
                  .refine(d => new Date(d) >= new Date(new Date().toDateString()), 'Must be today or future'),
  autoRenew:    z.boolean().default(true),
})})
```

**Business Logic:**
1. Verify mess `status === 'active'`
2. Verify plan belongs to mess, matches `mealSlot` + `durationType`
3. Check no active sub for `(userId, messId, mealSlot)` — Prisma throws `P2002` on partial unique index; catch + re-throw as `SUB_ALREADY_ACTIVE`
4. Calculate `endDate`: daily → same day; weekly → +6 days; monthly → +29 days
5. `full_day` → 3 slot rows per day (breakfast, lunch, dinner); otherwise 1 row/day
6. `prisma.$transaction`: create subscription + `createMany` slots + upsert wallet
7. INCR Redis headcounts for each generated slot date

**Success `201`**
```json
{
  "success": true,
  "data": { "subscriptionId": "uuid", "status": "active", "startDate": "2026-04-01", "endDate": "2026-04-30", "totalSlots": 30, "totalAmount": 2200 }
}
```

**Errors**

| Code | HTTP | Condition |
|---|---|---|
| `MESS_NOT_FOUND` | 404 | Mess not found |
| `MESS_NOT_ACTIVE` | 422 | Mess status is not `active` |
| `PLAN_NOT_FOUND` | 404 | Plan not found or wrong mess |
| `SUB_ALREADY_ACTIVE` | 409 | Active sub exists for this mess+slot |

---

#### GET `/subscriptions/:id` — Auth: Bearer
**Query Params:** `from`, `to` (YYYY-MM-DD, max 31-day window)

**Success `200`**
```json
{
  "success": true,
  "data": {
    "id": "uuid", "mess": { "id": "uuid", "name": "Sunita Tiffin Center" },
    "mealSlot": "lunch", "status": "active", "totalAmount": 2200,
    "calendar": [
      { "id": "uuid", "date": "2026-04-01", "mealSlot": "lunch", "status": "scheduled" },
      { "id": "uuid", "date": "2026-04-02", "mealSlot": "lunch", "status": "cancelled", "creditIssued": 73.33 }
    ]
  }
}
```

**Prisma Query:**
```typescript
prisma.subscription.findFirst({
  where: { id, userId },  // userId ensures ownership
  include: {
    mess: { select: { id: true, name: true } },
    mealSlots: { where: { date: { gte: from, lte: to } }, orderBy: { date: 'asc' } },
  },
})
```

---

#### PATCH `/subscriptions/:id/pause` — Auth: Bearer
**Request Body:** `{ "pauseStart": "2026-04-10", "pauseEnd": "2026-04-15" }`
**Zod:** validate `pauseEnd >= pauseStart`, max 30-day pause, `pauseStart >= today`
**Business Logic:** `prisma.$transaction` — update subscription status + `updateMany` slots in window to `skipped`

---

#### PATCH `/subscriptions/:id/cancel` — Auth: Bearer
**Request Body:** `{ "reason": "Leaving the city" }`
**Business Logic:** `prisma.$transaction` — set subscription `cancelled` + `updateMany` future scheduled slots to `cancelled` + calculate total credits + credit wallet + insert wallet_transaction

**Success `200`**
```json
{ "success": true, "data": { "subscriptionId": "uuid", "status": "cancelled", "creditsIssued": 1466.67, "walletBalance": 1466.67 } }
```

---

### 4.2 Meal Slots (Cancel a Meal)

#### GET `/subscriptions/:id/meal-slots` — Auth: Bearer
**Query Params:** `from`, `to`, `status`, `cursor`, `limit`

**Prisma Query:**
```typescript
prisma.subscriptionMealSlot.findMany({
  where: {
    subscriptionId,
    subscription: { userId },         // Ownership via relation filter
    ...(from && to && { date: { gte: new Date(from), lte: new Date(to) } }),
    ...(status !== 'all' && { status }),
  },
  orderBy: { date: 'asc' },
})
```

---

#### PATCH `/meal-slots/:slotId/cancel` — Auth: Bearer
**Request Body:** `{ "reason": "Working from home today" }`

**Business Logic:**
1. `prisma.subscriptionMealSlot.findFirst({ where: { id: slotId, subscription: { userId } }, include: { subscription: true } })`
2. Verify `status === 'scheduled'` → else `MEAL_SLOT_ALREADY_CANCELLED`
3. Verify `slot.date > addHours(new Date(), 24)` → else `MEAL_SLOT_WINDOW_EXPIRED`
4. `creditAmount = subscription.totalAmount / totalSlotsCount`
5. `prisma.$transaction`: cancel slot + increment wallet + insert wallet_tx
6. `redis.decr('hungrygo:headcount:' + messId + ':' + dateStr + ':' + mealSlot)`

**Success `200`**
```json
{
  "success": true,
  "data": { "slotId": "uuid", "status": "cancelled", "creditIssued": 73.33, "walletBalance": 146.66, "message": "Meal cancelled. ₹73.33 credited to your wallet." }
}
```

**Errors**

| Code | HTTP | Condition |
|---|---|---|
| `MEAL_SLOT_NOT_FOUND` | 404 | Slot not found or not owned by user |
| `MEAL_SLOT_ALREADY_CANCELLED` | 409 | Slot already cancelled |
| `MEAL_SLOT_WINDOW_EXPIRED` | 422 | Less than 24 hours to meal |

---

### 4.3 Wallet

#### GET `/wallet` — Auth: Bearer
```json
{ "success": true, "data": { "balance": 146.66, "updatedAt": "2026-04-02T10:30:00Z" } }
```
**Prisma:** `prisma.creditWallet.upsert({ where: { userId }, update: {}, create: { userId, balance: 0 } })`

#### GET `/wallet/transactions` — Auth: Bearer
**Query Params:** `type` (`credit|debit|all`), `cursor`, `limit` (default 20)

---

## 5. OpenAPI Documentation

> **Setup complete from Phase 1.** Add JSDoc `@openapi` blocks to new route files only.

### New Schemas (append to `src/config/swagger.ts` → `components.schemas`)

```typescript
Subscription: {
  type: 'object',
  properties: {
    id:            { type: 'string', format: 'uuid' },
    mess:          { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, city: { type: 'string' } } },
    mealSlot:      { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'full_day'] },
    durationType:  { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
    startDate:     { type: 'string', format: 'date' },
    endDate:       { type: 'string', format: 'date' },
    status:        { type: 'string', enum: ['pending_payment', 'active', 'paused', 'cancelled', 'expired'] },
    autoRenew:     { type: 'boolean' },
    totalAmount:   { type: 'number', example: 2200 },
    totalSlots:    { type: 'integer', example: 30 },
    cancelledSlots:{ type: 'integer', example: 2 },
  },
},
MealSlot: {
  type: 'object',
  properties: {
    id:           { type: 'string', format: 'uuid' },
    date:         { type: 'string', format: 'date' },
    mealSlot:     { type: 'string', enum: ['breakfast', 'lunch', 'dinner'] },
    status:       { type: 'string', enum: ['scheduled', 'delivered', 'cancelled', 'skipped'] },
    creditIssued: { type: 'number', example: 73.33 },
  },
},
WalletTransaction: {
  type: 'object',
  properties: {
    id:          { type: 'string', format: 'uuid' },
    amount:      { type: 'number', example: 73.33 },
    type:        { type: 'string', enum: ['credit', 'debit'] },
    reason:      { type: 'string', example: 'Meal cancelled on 2026-04-02' },
    referenceId: { type: 'string', format: 'uuid', nullable: true },
    createdAt:   { type: 'string', format: 'date-time' },
  },
},
```

---

### Subscription Routes (`subscription.routes.ts`)

```typescript
/**
 * @openapi
 * /subscriptions:
 *   get:
 *     tags: [Subscriptions]
 *     summary: List current user's subscriptions
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, paused, cancelled, expired, all], default: all }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Subscription list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Subscription' }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     cursor:   { type: string, nullable: true }
 *                     has_more: { type: boolean }
 *   post:
 *     tags: [Subscriptions]
 *     summary: Create a subscription
 *     description: >
 *       Creates a subscription and generates all meal slot records
 *       in a single database transaction. In Phase 3 the status
 *       is set to `active` directly; Phase 4 adds payment gating.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messId, planId, mealSlot, durationType, startDate]
 *             properties:
 *               messId:       { type: string, format: uuid }
 *               planId:       { type: string, format: uuid }
 *               mealSlot:     { type: string, enum: [breakfast, lunch, dinner, full_day] }
 *               durationType: { type: string, enum: [daily, weekly, monthly] }
 *               startDate:    { type: string, format: date, example: '2026-04-01' }
 *               autoRenew:    { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Subscription created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     subscriptionId: { type: string, format: uuid }
 *                     status:         { type: string, example: 'active' }
 *                     startDate:      { type: string, format: date }
 *                     endDate:        { type: string, format: date }
 *                     totalSlots:     { type: integer }
 *                     totalAmount:    { type: number }
 *       409:
 *         description: Active subscription already exists for this mess and meal slot
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /subscriptions/{id}:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get subscription detail with meal slot calendar
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Subscription with calendar
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   allOf:
 *                     - { $ref: '#/components/schemas/Subscription' }
 *                     - type: object
 *                       properties:
 *                         calendar:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/MealSlot' }
 *
 * /subscriptions/{id}/pause:
 *   patch:
 *     tags: [Subscriptions]
 *     summary: Pause subscription for a period
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
 *             required: [pauseStart, pauseEnd]
 *             properties:
 *               pauseStart: { type: string, format: date, example: '2026-04-10' }
 *               pauseEnd:   { type: string, format: date, example: '2026-04-15' }
 *     responses:
 *       200:
 *         description: Subscription paused
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Subscription' }
 *
 * /subscriptions/{id}/cancel:
 *   patch:
 *     tags: [Subscriptions]
 *     summary: Cancel subscription and issue wallet credits
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
 *               reason: { type: string, example: 'Leaving the city' }
 *     responses:
 *       200:
 *         description: Subscription cancelled with credits issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     subscriptionId: { type: string }
 *                     status:         { type: string, example: 'cancelled' }
 *                     creditsIssued:  { type: number, example: 1466.67 }
 *                     walletBalance:  { type: number, example: 1466.67 }
 */
```

---

### Meal Slot Routes (`meal-slot.routes.ts`)

```typescript
/**
 * @openapi
 * /meal-slots/{slotId}/cancel:
 *   patch:
 *     tags: [Subscriptions]
 *     summary: Cancel a single meal slot (Cancel a Meal)
 *     description: >
 *       Cancels a scheduled meal slot if it is more than 24 hours away.
 *       Issues a proportional wallet credit atomically.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slotId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, example: 'Working from home today' }
 *     responses:
 *       200:
 *         description: Meal cancelled and credit issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:      { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     slotId:        { type: string }
 *                     status:        { type: string, example: 'cancelled' }
 *                     creditIssued:  { type: number, example: 73.33 }
 *                     walletBalance: { type: number, example: 146.66 }
 *                     message:       { type: string }
 *       422:
 *         description: Cancellation window expired (< 24 hours to meal)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               error: { code: 'MEAL_SLOT_WINDOW_EXPIRED', message: 'Meal slots can only be cancelled 24 hours in advance.' }
 */
```

---

### Wallet Routes (`wallet.routes.ts`)

```typescript
/**
 * @openapi
 * /wallet:
 *   get:
 *     tags: [Wallet]
 *     summary: Get wallet balance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     balance:   { type: number, example: 146.66 }
 *                     updatedAt: { type: string, format: date-time }
 *
 * /wallet/transactions:
 *   get:
 *     tags: [Wallet]
 *     summary: Get wallet transaction history
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [credit, debit, all], default: all }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Transaction list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/WalletTransaction' }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     cursor:   { type: string, nullable: true }
 *                     has_more: { type: boolean }
 */
```

---

## 6. Frontend Pages (Minimal Reference)

| Page | Route | Description |
|---|---|---|
| My Subscriptions | `/subscriptions` | List with status badges |
| Subscription Detail | `/subscriptions/[id]` | Calendar + cancel/pause |
| Wallet | `/wallet` | Balance + history |

---

## 7. Tasks & Subtasks Checklist

### 7.1 Prisma Schema & Migration
- [ ] Append Phase 3 enums + `Subscription`, `SubscriptionMealSlot`, `CreditWallet`, `WalletTransaction` models
- [ ] Add relation fields to `User`, `MessProvider`, `PricingPlan`
- [ ] `npx prisma migrate dev --name phase3_subscriptions_wallet`
- [ ] Edit generated migration — add partial unique index + `balance_non_negative` CHECK
- [ ] `npx prisma generate`

### 7.2 Wallet Module
- [ ] `wallet.types.ts` — `WalletBalance`, `WalletTransactionRow`
- [ ] `wallet.repository.ts`:
  - `getOrCreate(userId)` → `prisma.creditWallet.upsert`
  - `getTransactions(userId, opts)` → `prisma.walletTransaction.findMany` cursor paginated
- [ ] `wallet.service.ts`, `wallet.controller.ts`, `wallet.routes.ts`

### 7.3 Subscription Module
- [ ] `subscription.types.ts` — `CreateSubscriptionDto`, `MealSlotDateEntry`
- [ ] `subscription.schema.ts` — `createSubscriptionSchema`, `pauseSubscriptionSchema`
- [ ] Helper: `generateSlotDates(startDate, endDate, mealSlot): MealSlotDateEntry[]`
- [ ] `subscription.repository.ts`:
  - `findByUser(userId, opts)` — with `_count: { mealSlots }` and mess select
  - `findByIdForUser(id, userId)` — include mess + mealSlots with date filter
  - `create(data, slotRows)` → `prisma.$transaction`: create sub + `createMany` slots + upsert wallet
  - `updateStatus(id, status, extra?)` → `prisma.subscription.update`
  - `cancelFutureSlots(subscriptionId, tx)` → `tx.subscriptionMealSlot.updateMany`
- [ ] `subscription.service.ts` — full validation + `prisma.$transaction` + Redis INCR headcounts
- [ ] `subscription.controller.ts` — 5 handlers, `subscription.routes.ts`

### 7.4 Meal Slot Module
- [ ] `meal-slot.types.ts` — `MealSlotWithSub`, `CancelMealSlotDto`
- [ ] `meal-slot.schema.ts` — `cancelMealSlotSchema`
- [ ] `meal-slot.repository.ts`:
  - `findBySubscription(subscriptionId, userId, opts)` — relation filter for ownership
  - `findByIdWithOwnership(slotId, userId)` → `prisma.subscriptionMealSlot.findFirst({ where: { id, subscription: { userId } }, include: { subscription: true } })`
  - `cancelSlot(slotId, userId, creditAmount, reason)` → `prisma.$transaction` as shown in Section 3
- [ ] `meal-slot.service.ts` — 24h check, credit calc, atomic cancel, Redis DECR
- [ ] `meal-slot.controller.ts`, `meal-slot.routes.ts`

### 7.5 Error Codes (append to `errorCodes.ts`)
```typescript
SUB_NOT_FOUND:               'SUB_NOT_FOUND',
SUB_ALREADY_ACTIVE:          'SUB_ALREADY_ACTIVE',
SUB_NOT_ACTIVE:              'SUB_NOT_ACTIVE',
MEAL_SLOT_NOT_FOUND:         'MEAL_SLOT_NOT_FOUND',
MEAL_SLOT_ALREADY_CANCELLED: 'MEAL_SLOT_ALREADY_CANCELLED',
MEAL_SLOT_WINDOW_EXPIRED:    'MEAL_SLOT_WINDOW_EXPIRED',
```

### 7.6 App Registration
- [ ] Register `subscriptionRoutes`, `mealSlotRoutes`, `walletRoutes` in `src/app.ts`

### 7.6 OpenAPI
- [ ] Append `Subscription`, `MealSlot`, `WalletTransaction` schemas to `src/config/swagger.ts`
- [ ] Add `@openapi` JSDoc blocks to `subscription.routes.ts` — GET/POST `/subscriptions`, GET `/subscriptions/{id}`, PATCH pause/cancel
- [ ] Add `@openapi` JSDoc block to `meal-slot.routes.ts` — PATCH `/meal-slots/{slotId}/cancel`
- [ ] Add `@openapi` JSDoc blocks to `wallet.routes.ts` — GET `/wallet`, GET `/wallet/transactions`
- [ ] Verify Subscriptions and Wallet tags appear in Swagger UI

### 7.7 Tests
- [ ] `subscription.service.test.ts` — duplicate SUB_ALREADY_ACTIVE (P2002 catch), date range calc, full_day slot count
- [ ] `meal-slot.service.test.ts` — 24h window pass/fail, credit = totalAmount / totalSlots
- [ ] `wallet.repository.test.ts` — mock prisma; upsert on first sub
- [ ] `subscription.routes.test.ts` — create → view calendar → cancel meal → verify wallet balance
