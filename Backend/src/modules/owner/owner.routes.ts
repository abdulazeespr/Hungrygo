import { Router } from 'express';
import { ownerController } from './owner.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import {
  dashboardSchema,
  subscribersSchema,
  headcountSchema,
  earningsSchema,
} from './owner.schema.js';

const router = Router();

// Owner routes require authentication and 'mess_owner' role
router.use(authenticate);
router.use(authorize('mess_owner'));

/**
 * @openapi
 * tags:
 *   name: Owner
 *   description: Mess Owner Dashboard endpoints
 */

/**
 * @openapi
 * /owner/dashboard:
 *   get:
 *     tags: [Owner]
 *     summary: Get dashboard stats (active subs, avg rating)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: messId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Dashboard summary
 */
router.get('/dashboard', validate(dashboardSchema), asyncHandler(ownerController.getDashboard));

/**
 * @openapi
 * /owner/subscribers:
 *   get:
 *     tags: [Owner]
 *     summary: List subscribers for a mess
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: messId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [all, active, pending_payment, paused, cancelled], default: all }
 *     responses:
 *       200:
 *         description: Subscriber list
 */
router.get('/subscribers', validate(subscribersSchema), asyncHandler(ownerController.getSubscribers));

/**
 * @openapi
 * /owner/headcount:
 *   get:
 *     tags: [Owner]
 *     summary: Get meal headcount for a specific date
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: messId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Headcount numbers (from Redis or DB fallback)
 */
router.get('/headcount', validate(headcountSchema), asyncHandler(ownerController.getHeadcount));

/**
 * @openapi
 * /owner/earnings:
 *   get:
 *     tags: [Owner]
 *     summary: Get earnings grouped by day
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: messId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Earnings chart data
 */
router.get('/earnings', validate(earningsSchema), asyncHandler(ownerController.getEarnings));

export default router;
