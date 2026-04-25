import { Router } from 'express';
import { paymentController } from './payment.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { verifyPaymentSchema, listPaymentsSchema } from './payment.schema.js';
import express from 'express';

const router = Router();

// Notice: Webhook route exists outside this file, placed in app.ts immediately before express.json()
// This router handles standard JSON authenticated routes.

router.use(authenticate);

/**
 * @openapi
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
router.get('/', validate(listPaymentsSchema), asyncHandler(paymentController.getPayments));

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
 *       409:
 *         description: Payment already captured
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/verify', validate(verifyPaymentSchema), asyncHandler(paymentController.verifyPayment));

export default router;
