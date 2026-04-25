import { Router } from 'express';
import { mealSlotController } from './meal-slot.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { cancelMealSlotSchema } from './meal-slot.schema.js';

const router = Router();

// All meal-slot routes require authentication
router.use(authenticate);

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
 *       409:
 *         description: Meal slot already cancelled
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       422:
 *         description: Cancellation window expired (< 24 hours to meal)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               error: { code: 'MEAL_SLOT_WINDOW_EXPIRED', message: 'Meal slots can only be cancelled 24 hours in advance.' }
 */
router.patch(
  '/:slotId/cancel',
  validate(cancelMealSlotSchema),
  asyncHandler(mealSlotController.cancel),
);

export default router;
