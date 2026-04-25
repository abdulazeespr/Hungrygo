# Hungrygo — Phase 4: Payments, Reviews & Owner Dashboard
> **LLM Instruction:** Phases 1–3 complete. Append new models to `prisma/schema.prisma`. Run `prisma migrate dev` + `prisma generate`. Edit `subscription.service.ts` from Phase 3 — do not recreate it. Import Prisma types from `../../generated/prisma/client.js`. Razorpay webhook route must use `express.raw()` — register it BEFORE the global `express.json()` middleware in `src/app.ts`.

---

## 1. PRD Summary

### Goal
Gate subscription activation behind Razorpay payment. Add reviews. Build mess owner dashboard with headcount, subscriber list, and earnings.

### Scope (Phase 4 only)
- Append to `prisma/schema.prisma`: `Payment`, `Review`, `MessPhoto` models
- Modify `Subscription` model: add `paymentId` FK, change default `status` to `pending_payment`
- Razorpay: create order → verify HMAC signature → activate subscription + generate meal slots
- Razorpay webhook (idempotent)
- Wallet credit deduction toward payment amount
- Reviews: eligibility gated on subscription history; avg_rating recalculated on each review
- Owner dashboard: headcount (Redis first, DB fallback), subscriber list, earnings

### Out of Scope
Admin panel, notifications, promo codes — Phase 5.

### Success Criteria
- Subscription creation returns Razorpay order; meal slots generated only after `POST /payments/verify`
- Webhook handles `payment.captured` idempotently
- Razorpay webhook route uses `express.raw()` before global `express.json()`
- Review submission blocked if user has no subscription history with the mess

---

## 2. Prisma Schema — Phase 4 Additions

### Append to `prisma/schema.prisma`

```prisma
// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4 ENUMS
// ─────────────────────────────────────────────────────────────────────────────

enum PaymentStatus {
  pending
  captured
  failed
  refunded
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4 MODELS
// ─────────────────────────────────────────────────────────────────────────────

model Payment {
  id                String        @id @default(uuid()) @db.Uuid
  userId            String        @map("user_id") @db.Uuid
  subscriptionId    String?       @map("subscription_id") @db.Uuid
  amount            Decimal       @db.Decimal(10, 2)
  walletAmountUsed  Decimal       @default(0) @map("wallet_amount_used") @db.Decimal(10, 2)
  currency          String        @default("INR") @db.VarChar(5)
  status            PaymentStatus @default(pending)
  razorpayOrderId   String?       @unique @map("razorpay_order_id") @db.VarChar(100)
  razorpayPaymentId String?       @unique @map("razorpay_payment_id") @db.VarChar(100)
  razorpaySignature String?       @map("razorpay_signature")
  failureReason     String?       @map("failure_reason")
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt      @map("updated_at")

  user         User          @relation(fields: [userId],         references: [id])
  subscription Subscription? @relation(fields: [subscriptionId], references: [id])

  @@index([userId])
  @@index([subscriptionId])
  @@index([status])
  @@map("payments")
}

model Review {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  messId    String   @map("mess_id") @db.Uuid
  rating    Int      @db.SmallInt
  comment   String?
  isVisible Boolean  @default(true) @map("is_visible")
  createdAt DateTime @default(now()) @map("created_at")

  user User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  mess MessProvider @relation(fields: [messId],  references: [id], onDelete: Cascade)

  @@unique([userId, messId])
  @@index([messId])
  @@map("reviews")
}

model MessPhoto {
  id        String   @id @default(uuid()) @db.Uuid
  messId    String   @map("mess_id") @db.Uuid
  url       String
  isCover   Boolean  @default(false) @map("is_cover")
  createdAt DateTime @default(now()) @map("created_at")

  mess MessProvider @relation(fields: [messId], references: [id], onDelete: Cascade)

  @@index([messId])
  @@map("mess_photos")
}
```

### Append relation fields to existing models
```prisma
// In Subscription model add:
paymentId String?  @map("payment_id") @db.Uuid
payment   Payment? @relation(fields: [paymentId], references: [id])
payments  Payment[]

// In User model add:
payments Payment[]
reviews  Review[]

// In MessProvider model add:
reviews Review[]
photos  MessPhoto[]
```

### Raw Migration Additions
```sql
ALTER TABLE subscriptions
  ADD COLUMN payment_id UUID REFERENCES payments(id);

-- New subscriptions default to pending_payment
ALTER TABLE subscriptions
  ALTER COLUMN status SET DEFAULT 'pending_payment';
```

---

## 3. Folder & File Structure

> Only new files. Earlier files unchanged except `subscription.service.ts` (modify), `src/app.ts` (webhook route before express.json).

```
src/
├── modules/
│   │
│   ├── payment/                        # NEW
│   │   ├── payment.routes.ts           # webhook registered with express.raw()
│   │   ├── payment.controller.ts
│   │   ├── payment.service.ts          # Razorpay SDK, HMAC verify, activate
│   │   ├── payment.repository.ts       # prisma.$transaction: capture + activate + createMany
│   │   ├── payment.schema.ts
│   │   └── payment.types.ts
│   │
│   ├── review/                         # NEW
│   │   ├── review.routes.ts
│   │   ├── review.controller.ts
│   │   ├── review.service.ts
│   │   ├── review.repository.ts        # eligibility check, $transaction for rating update
│   │   ├── review.schema.ts
│   │   └── review.types.ts
│   │
│   └── owner/                          # NEW
│       ├── owner.routes.ts
│       ├── owner.controller.ts
│       ├── owner.service.ts            # headcount: Redis → DB fallback
│       ├── owner.repository.ts         # prisma aggregations + $queryRaw for earnings
│       └── owner.types.ts
│
├── modules/subscription/
│   └── subscription.service.ts         # MODIFY — status = 'pending_payment', return razorpay_order
│
└── shared/errors/
    └── errorCodes.ts                   # APPEND Phase 4 codes
```

### Critical app.ts Modification
```typescript
// src/app.ts — Webhook MUST be registered BEFORE global express.json()
import express from 'express';
import { paymentController } from './modules/payment/payment.controller.js';

// Step 1: Register webhook with raw body parser FIRST
app.post(
  '/api/v1/payments/webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(paymentController.handleWebhook)
);

// Step 2: Then register global JSON middleware
app.use(express.json({ limit: '1mb' }));

// Step 3: Rest of routes...
```

### Prisma 7 Payment Activation Transaction
```typescript
// payment.repository.ts
import prisma from '../../config/database.js';

export const paymentRepository = {
  async activateSubscription(
    paymentId: string,
    subscriptionId: string,
    razorpayPaymentId: string,
    signature: string,
    slotRows: MealSlotRow[]
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'captured', razorpayPaymentId, razorpaySignature: signature },
      });

      await tx.subscription.update({
        where: { id: subscriptionId },
        data:  { status: 'active', paymentId },
      });

      await tx.subscriptionMealSlot.createMany({ data: slotRows });

      return tx.subscription.findUnique({
        where: { id: subscriptionId },
        select: { id: true, startDate: true, endDate: true, mealSlots: { select: { id: true } } },
      });
    });
  },
};
```

---

## 4. API Endpoints

### Base URL: `/api/v1`

---

### 4.1 Subscription Creation — Modified from Phase 3

#### POST `/subscriptions` (Modified)
**Change:** Status is now `pending_payment`. Meal slots generated only after payment verified.

**Modified Success `201`**
```json
{
  "success": true,
  "data": {
    "subscriptionId": "uuid",
    "status": "pending_payment",
    "razorpayOrder": {
      "id": "order_xyz123",
      "amount": 220000,
      "currency": "INR",
      "keyId": "rzp_live_..."
    },
    "walletCreditApplied": 0,
    "amountDue": 2200
  }
}
```

**Modified Service Flow (edit Phase 3 `subscription.service.ts`):**
1. All Phase 3 validations remain
2. Check wallet balance → deduct wallet credits first if available
3. INSERT subscription with `status: 'pending_payment'` — **do NOT generate meal slots yet**
4. Call `razorpay.orders.create({ amount: amountDueInPaise, currency: 'INR', receipt: subscriptionId })`
5. INSERT payment record (`status: 'pending'`, `razorpayOrderId`)
6. Return `{ subscriptionId, razorpayOrder, walletCreditApplied, amountDue }`

---

### 4.2 Payment Module

#### POST `/payments/verify` — Auth: Bearer
**Request Body:**
```json
{
  "razorpayOrderId": "order_xyz123",
  "razorpayPaymentId": "pay_abc456",
  "razorpaySignature": "sha256_hash"
}
```

**Business Logic:**
1. `prisma.payment.findUnique({ where: { razorpayOrderId }, include: { subscription: true } })`
2. Check `payment.status === 'pending'` → `PAYMENT_ALREADY_CAPTURED` if not
3. Verify HMAC: `crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(orderId + '|' + paymentId).digest('hex')`
4. Invalid → UPDATE payment `failed` → throw `PAYMENT_VERIFICATION_FAILED`
5. Valid → `paymentRepository.activateSubscription(...)` → INCR Redis headcounts

**Success `200`**
```json
{ "success": true, "data": { "subscriptionId": "uuid", "status": "active", "startDate": "2026-04-01", "endDate": "2026-04-30", "totalSlots": 30 } }
```

**Errors**

| Code | HTTP | Condition |
|---|---|---|
| `PAYMENT_NOT_FOUND` | 404 | No payment for this order_id |
| `PAYMENT_VERIFICATION_FAILED` | 400 | HMAC mismatch |
| `PAYMENT_ALREADY_CAPTURED` | 409 | Already processed |

---

#### POST `/payments/webhook` — Public (Razorpay HMAC header)
**Middleware:** `express.raw({ type: 'application/json' })` — registered before `express.json()` in `app.ts`

**Signature Verification:**
```typescript
const expectedSig = crypto
  .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
  .update(req.body as Buffer)   // raw Buffer from express.raw()
  .digest('hex');
if (expectedSig !== req.headers['x-razorpay-signature']) {
  throw new HttpError(400, 'WEBHOOK_INVALID_SIGNATURE', 'Signature mismatch');
}
```

**Events Handled:**
- `payment.captured` → same as verify flow — check `payment.status !== 'captured'` first (idempotency)
- `payment.failed` → `prisma.$transaction`: UPDATE payment `failed` + UPDATE subscription `cancelled`

**Response:** Always `200 { "received": true }` — never return 4xx/5xx to Razorpay (it retries on non-200)

---

#### GET `/payments` — Auth: Bearer
**Success `200`** — paginated payment history with subscription info

---

### 4.3 Reviews

#### POST `/mess-providers/:id/reviews` — Auth: Bearer
**Request Body:** `{ "rating": 4, "comment": "Good food." }`

**Zod:**
```typescript
z.object({ body: z.object({
  rating:  z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
})})
```

**Eligibility Check:**
```typescript
const eligible = await prisma.subscription.findFirst({
  where: { userId, messId, status: { in: ['active', 'expired', 'cancelled'] } },
});
if (!eligible) throw new HttpError(403, 'REVIEW_NOT_ELIGIBLE', '...');
```

**Business Logic:** `prisma.$transaction`: INSERT review + recalculate `MessProvider.avgRating` + `totalReviews`

```typescript
// Recalculate avg_rating in transaction
const agg = await tx.review.aggregate({
  where: { messId, isVisible: true },
  _avg: { rating: true },
  _count: { rating: true },
});
await tx.messProvider.update({
  where: { id: messId },
  data: { avgRating: agg._avg.rating ?? 0, totalReviews: agg._count.rating },
});
```

**Errors:** `REVIEW_NOT_ELIGIBLE` 403 · `REVIEW_ALREADY_EXISTS` 409 (P2002 on `@@unique([userId, messId])`)

---

#### GET `/mess-providers/:id/reviews` — Auth: Public
**Query Params:** `cursor`, `limit` (default 10), `sort` (`recent|rating`)

**Prisma Query:**
```typescript
prisma.review.findMany({
  where: { messId, isVisible: true },
  include: { user: { select: { id: true, name: true } } },
  orderBy: sort === 'rating' ? { rating: 'desc' } : { createdAt: 'desc' },
  take: limit, cursor: cursor ? { id: cursor } : undefined, skip: cursor ? 1 : 0,
})
```

---

### 4.4 Owner Dashboard

#### GET `/owner/dashboard` — Auth: Bearer (`mess_owner`)
**Success `200`**
```json
{
  "success": true,
  "data": {
    "messId": "uuid", "messName": "Sunita Tiffin Center",
    "activeSubscribers": 42,
    "todaysHeadcount": { "breakfast": 12, "lunch": 38, "dinner": 27 },
    "thisMonthEarnings": 92400, "avgRating": 4.3
  }
}
```
**Headcount:** Redis MGET `hungrygo:headcount:{messId}:{today}:breakfast` etc. → fallback to Prisma `groupBy` if keys missing

---

#### GET `/owner/subscribers` — Auth: Bearer (`mess_owner`)
**Query Params:** `mealSlot`, `cursor`, `limit`

**Prisma Query:**
```typescript
prisma.subscription.findMany({
  where: { messId: ownerMess.id, status: 'active', ...(mealSlot && { mealSlot }) },
  include: { user: { select: { id: true, name: true, phone: true } } },
  orderBy: { createdAt: 'desc' },
})
```

---

#### GET `/owner/headcount` — Auth: Bearer (`mess_owner`)
**Query Params:** `date=YYYY-MM-DD` (default: today)
**Success `200`** — `{ date, headcount: { breakfast, lunch, dinner } }`
**DB Fallback:**
```typescript
prisma.subscriptionMealSlot.groupBy({
  by: ['mealSlot'],
  where: { date: new Date(date), status: 'scheduled', subscription: { messId } },
  _count: true,
})
```

---

#### GET `/owner/earnings` — Auth: Bearer (`mess_owner`)
**Query Params:** `from`, `to` (default: current month)

**Prisma `$queryRaw`:**
```typescript
prisma.$queryRaw`
  SELECT
    DATE(p.created_at)     AS date,
    SUM(p.amount)          AS amount,
    COUNT(DISTINCT s.id)   AS new_subscribers
  FROM payments p
  JOIN subscriptions s ON s.id = p.subscription_id
  WHERE s.mess_id = ${messId}
    AND p.status = 'captured'
    AND p.created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz
  GROUP BY DATE(p.created_at)
  ORDER BY date ASC
`
```

---

#### POST/DELETE `/mess-providers/:id/photos` — Auth: Bearer (mess owner)
**POST:** `{ "url": "https://s3...", "isCover": false }` → `prisma.$transaction` unset cover + create
**DELETE `:photoId`:** `prisma.messPhoto.delete({ where: { id: photoId, messId } })`

---

## 5. OpenAPI Documentation

> **Setup complete from Phase 1.** Add JSDoc `@openapi` blocks to new route files only.

### New Schemas (append to `src/config/swagger.ts` → `components.schemas`)

```typescript
Payment: {
  type: 'object',
  properties: {
    id:                 { type: 'string', format: 'uuid' },
    amount:             { type: 'number', example: 2200 },
    walletAmountUsed:   { type: 'number', example: 0 },
    currency:           { type: 'string', example: 'INR' },
    status:             { type: 'string', enum: ['pending', 'captured', 'failed', 'refunded'] },
    razorpayOrderId:    { type: 'string', nullable: true },
    razorpayPaymentId:  { type: 'string', nullable: true },
    createdAt:          { type: 'string', format: 'date-time' },
  },
},
Review: {
  type: 'object',
  properties: {
    id:        { type: 'string', format: 'uuid' },
    user:      { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string', nullable: true } } },
    rating:    { type: 'integer', minimum: 1, maximum: 5, example: 4 },
    comment:   { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
},
RazorpayOrder: {
  type: 'object',
  properties: {
    id:       { type: 'string', example: 'order_xyz123' },
    amount:   { type: 'integer', example: 220000, description: 'Amount in paise' },
    currency: { type: 'string', example: 'INR' },
    keyId:    { type: 'string', example: 'rzp_live_...' },
  },
},
```

---

### Subscription Routes — Modified Response (update existing JSDoc in `subscription.routes.ts`)

```typescript
/**
 * @openapi
 * /subscriptions:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Create a subscription (returns Razorpay order)
 *     description: >
 *       Creates a subscription with status `pending_payment` and returns a
 *       Razorpay order. Wallet credits are deducted first if available.
 *       Meal slots are only generated after POST /payments/verify succeeds.
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
 *               promoCode:    { type: string, nullable: true, example: 'WELCOME100' }
 *     responses:
 *       201:
 *         description: Subscription created — complete payment to activate
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     subscriptionId:     { type: string, format: uuid }
 *                     status:             { type: string, example: 'pending_payment' }
 *                     razorpayOrder:      { $ref: '#/components/schemas/RazorpayOrder' }
 *                     walletCreditApplied:{ type: number, example: 0 }
 *                     amountDue:          { type: number, example: 2200 }
 */
```

---

### Payment Routes (`payment.routes.ts`)

```typescript
/**
 * @openapi
 * /payments/verify:
 *   post:
 *     tags: [Payments]
 *     summary: Verify Razorpay payment and activate subscription
 *     description: >
 *       Verifies the HMAC signature from Razorpay. On success, activates the
 *       subscription, generates all meal slot records, and increments Redis
 *       headcounts. Idempotent — safe to call multiple times with same payload.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [razorpayOrderId, razorpayPaymentId, razorpaySignature]
 *             properties:
 *               razorpayOrderId:   { type: string, example: 'order_xyz123' }
 *               razorpayPaymentId: { type: string, example: 'pay_abc456' }
 *               razorpaySignature: { type: string, example: 'sha256_hash' }
 *     responses:
 *       200:
 *         description: Payment verified — subscription activated
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
 *                     status:         { type: string, example: 'active' }
 *                     startDate:      { type: string, format: date }
 *                     endDate:        { type: string, format: date }
 *                     totalSlots:     { type: integer }
 *       400:
 *         description: Signature verification failed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               error: { code: 'PAYMENT_VERIFICATION_FAILED', message: 'Payment signature is invalid.' }
 *       409:
 *         description: Payment already captured
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Razorpay webhook receiver
 *     description: >
 *       Receives async payment events from Razorpay. Verifies
 *       `X-Razorpay-Signature` header using HMAC-SHA256.
 *       Always returns 200 to acknowledge receipt.
 *       **Note:** This route uses `express.raw()` — registered before
 *       the global `express.json()` middleware.
 *     parameters:
 *       - in: header
 *         name: X-Razorpay-Signature
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event: { type: string, example: 'payment.captured' }
 *               payload: { type: object }
 *     responses:
 *       200:
 *         description: Webhook acknowledged
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received: { type: boolean, example: true }
 *
 * /payments:
 *   get:
 *     tags: [Payments]
 *     summary: List payment history
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Payment list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Payment' }
 */
```

---

### Review Routes (`review.routes.ts`)

```typescript
/**
 * @openapi
 * /mess-providers/{id}/reviews:
 *   get:
 *     tags: [Reviews]
 *     summary: List reviews for a mess
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [recent, rating], default: recent }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Review list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Review' }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     cursor:   { type: string, nullable: true }
 *                     has_more: { type: boolean }
 *   post:
 *     tags: [Reviews]
 *     summary: Submit a review
 *     description: >
 *       User must have an active, expired, or cancelled subscription
 *       to this mess. One review per user per mess.
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
 *             required: [rating]
 *             properties:
 *               rating:  { type: integer, minimum: 1, maximum: 5, example: 4 }
 *               comment: { type: string, maxLength: 500 }
 *     responses:
 *       201:
 *         description: Review created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Review' }
 *       403:
 *         description: User not eligible (no subscription history)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Review already exists for this mess
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
```

---

### Owner Routes (`owner.routes.ts`)

```typescript
/**
 * @openapi
 * /owner/dashboard:
 *   get:
 *     tags: [Owner]
 *     summary: Get owner dashboard stats
 *     description: >
 *       Returns active subscriber count, today's headcount from Redis
 *       (falls back to DB if Redis keys missing), monthly earnings, and avg rating.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     messId:            { type: string }
 *                     messName:          { type: string }
 *                     activeSubscribers: { type: integer }
 *                     todaysHeadcount:
 *                       type: object
 *                       properties:
 *                         breakfast: { type: integer }
 *                         lunch:     { type: integer }
 *                         dinner:    { type: integer }
 *                     thisMonthEarnings: { type: number }
 *                     avgRating:         { type: number }
 *
 * /owner/headcount:
 *   get:
 *     tags: [Owner]
 *     summary: Get headcount for a specific date
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *         description: Defaults to today
 *     responses:
 *       200:
 *         description: Headcount by meal slot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     date:      { type: string, format: date }
 *                     headcount:
 *                       type: object
 *                       properties:
 *                         breakfast: { type: integer }
 *                         lunch:     { type: integer }
 *                         dinner:    { type: integer }
 *
 * /owner/earnings:
 *   get:
 *     tags: [Owner]
 *     summary: Get earnings breakdown
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Earnings summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalEarned:      { type: number }
 *                     totalSubscribers: { type: integer }
 *                     breakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:           { type: string, format: date }
 *                           amount:         { type: number }
 *                           newSubscribers: { type: integer }
 */
```

---

## 6. Frontend Pages (Minimal Reference)

| Page | Route | Description |
|---|---|---|
| Checkout | `/subscriptions/[id]/pay` | Razorpay widget |
| Payment Success | `/subscriptions/[id]/success` | Confirmation |
| Owner Dashboard | `/owner/dashboard` | Stats overview |
| Owner Subscribers | `/owner/subscribers` | List |
| Owner Headcount | `/owner/headcount` | Meal prep numbers |
| Owner Earnings | `/owner/earnings` | Monthly earnings |

---

## 7. Tasks & Subtasks Checklist

### 7.1 Prisma Schema & Migration
- [ ] Append `PaymentStatus` enum + `Payment`, `Review`, `MessPhoto` models
- [ ] Add relation fields to `Subscription`, `User`, `MessProvider`
- [ ] `npx prisma migrate dev --name phase4_payments_reviews`
- [ ] Edit generated migration: ADD `payment_id` to subscriptions + change default status
- [ ] `npx prisma generate`

### 7.2 Modify Subscription Service (Phase 3 file — edit, do not recreate)
- [ ] `createSubscription`: set `status: 'pending_payment'` on INSERT
- [ ] After INSERT: deduct wallet balance in same transaction if credits available
- [ ] Call `razorpay.orders.create(...)` → INSERT payment record
- [ ] Remove meal slot generation from here — moved to `payment.service.ts`
- [ ] Return `{ subscriptionId, razorpayOrder, walletCreditApplied, amountDue }`

### 7.3 Payment Module
- [ ] Install: `razorpay` (Razorpay Node SDK)
- [ ] `payment.types.ts` — `VerifyPaymentDto`, `RazorpayWebhookEvent`, `CreateOrderResult`
- [ ] `payment.schema.ts` — `verifyPaymentSchema`
- [ ] `payment.repository.ts`:
  - `create(data)` → `prisma.payment.create`
  - `findByOrderId(razorpayOrderId)` → include subscription
  - `activateSubscription(paymentId, subId, rpPaymentId, sig, slotRows)` → `prisma.$transaction` as shown in Section 3
  - `failPayment(paymentId, subscriptionId, reason)` → `prisma.$transaction`: UPDATE payment `failed` + sub `cancelled`
- [ ] `payment.service.ts`:
  - `createOrder(userId, subId, amount, walletAmountUsed)` — Razorpay SDK + INSERT payment
  - `verifyPayment(userId, dto)` — HMAC verify → activate → INCR Redis headcounts
  - `handleWebhook(rawBody: Buffer, signature: string)` — verify sig → parse → idempotent activate/fail
- [ ] `payment.controller.ts` — `verifyPayment`, `handleWebhook`, `getPayments`
- [ ] `payment.routes.ts` — webhook with `express.raw()`; other routes with `authenticate`
- [ ] **Update `src/app.ts`** — register webhook BEFORE `express.json()` global middleware

### 7.4 Review Module
- [ ] `review.types.ts`, `review.schema.ts` — `createReviewSchema`
- [ ] `review.repository.ts`:
  - `checkEligibility(userId, messId)` → `prisma.subscription.findFirst`
  - `create(data)` → `prisma.$transaction`: INSERT review + aggregate + UPDATE mess rating
  - `findByMess(messId, opts)` → cursor paginated
- [ ] `review.service.ts` — eligibility → create → catch P2002 → `REVIEW_ALREADY_EXISTS`
- [ ] `review.controller.ts`, `review.routes.ts`

### 7.5 Owner Module
- [ ] `owner.types.ts` — `DashboardStats`, `HeadcountData`, `EarningBreakdown`
- [ ] `owner.repository.ts`:
  - `getOwnerMess(userId)` → `prisma.messProvider.findFirst({ where: { ownerId: userId } })`
  - `getActiveSubscriberCount(messId)` → `prisma.subscription.count`
  - `getSubscribers(messId, opts)` → paginated
  - `getEarnings(messId, from, to)` → `prisma.$queryRaw` as shown in Section 4
  - `getHeadcountFromDb(messId, date)` → `prisma.subscriptionMealSlot.groupBy`
- [ ] `owner.service.ts` — Redis headcount → DB fallback
- [ ] `owner.controller.ts` — 4 handlers
- [ ] `owner.routes.ts` — `authenticate` + `authorize('mess_owner')`

### 7.6 Error Codes (append)
```typescript
PAYMENT_NOT_FOUND:           'PAYMENT_NOT_FOUND',
PAYMENT_VERIFICATION_FAILED: 'PAYMENT_VERIFICATION_FAILED',
PAYMENT_ALREADY_CAPTURED:    'PAYMENT_ALREADY_CAPTURED',
WEBHOOK_INVALID_SIGNATURE:   'WEBHOOK_INVALID_SIGNATURE',
REVIEW_NOT_ELIGIBLE:         'REVIEW_NOT_ELIGIBLE',
REVIEW_ALREADY_EXISTS:       'REVIEW_ALREADY_EXISTS',
```

### 7.7 App Registration
- [ ] Webhook route BEFORE `express.json()` in `app.ts`
- [ ] Register `paymentRoutes`, `reviewRoutes`, `ownerRoutes`

### 7.7 OpenAPI
- [ ] Append `Payment`, `Review`, `RazorpayOrder` schemas to `src/config/swagger.ts`
- [ ] Update `@openapi` block on `POST /subscriptions` in `subscription.routes.ts` — add `promoCode` field + updated response with `razorpayOrder`
- [ ] Add `@openapi` JSDoc blocks to `payment.routes.ts` — `/payments/verify`, `/payments/webhook`, `/payments`
- [ ] Add `@openapi` JSDoc blocks to `review.routes.ts` — GET/POST `/mess-providers/{id}/reviews`
- [ ] Add `@openapi` JSDoc blocks to `owner.routes.ts` — dashboard, headcount, earnings
- [ ] Verify Payments, Reviews, Owner tags appear in Swagger UI

### 7.8 Tests
- [ ] `payment.service.test.ts` — HMAC pass/fail, idempotent webhook
- [ ] `review.service.test.ts` — eligibility fail, P2002 → REVIEW_ALREADY_EXISTS, avg_rating
- [ ] `payment.routes.test.ts` — create sub → verify → check status active + meal slots count
- [ ] `owner.routes.test.ts` — headcount Redis vs DB fallback
