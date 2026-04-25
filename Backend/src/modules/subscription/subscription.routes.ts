import { Router } from 'express';
import { subscriptionController } from './subscription.controller.js';
import { mealSlotController } from '../meal-slot/meal-slot.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import {
  createSubscriptionSchema,
  listSubscriptionsSchema,
  getSubscriptionSchema,
  pauseSubscriptionSchema,
  cancelSubscriptionSchema,
  listMealSlotsForSubSchema,
} from './subscription.schema.js';

const router = Router();

// All subscription routes require authentication
router.use(authenticate);

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
 */
router.get('/', validate(listSubscriptionsSchema), asyncHandler(subscriptionController.list));
router.post('/', validate(createSubscriptionSchema), asyncHandler(subscriptionController.create));

/**
 * @openapi
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
 *                           items: { $ref: '#/components/schemas/MealSlotSchema' }
 */
router.get('/:id', validate(getSubscriptionSchema), asyncHandler(subscriptionController.getById));

/**
 * @openapi
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
 */
router.patch('/:id/pause', validate(pauseSubscriptionSchema), asyncHandler(subscriptionController.pause));

/**
 * @openapi
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
router.patch('/:id/cancel', validate(cancelSubscriptionSchema), asyncHandler(subscriptionController.cancel));

/**
 * @openapi
 * /subscriptions/{id}/meal-slots:
 *   get:
 *     tags: [Subscriptions]
 *     summary: List meal slots for a subscription
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
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [scheduled, delivered, cancelled, skipped, all], default: all }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 30 }
 *     responses:
 *       200:
 *         description: Meal slot list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/MealSlotSchema' }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     cursor:   { type: string, nullable: true }
 *                     has_more: { type: boolean }
 */
router.get(
  '/:id/meal-slots',
  validate(listMealSlotsForSubSchema),
  asyncHandler(mealSlotController.list),
);

export default router;
