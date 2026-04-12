import { Router } from 'express';
import { menuController } from './menu.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { upsertMenuSchema, getMenuRangeSchema, menuParamsSchema } from './menu.schema.js';

// The route prefix in app.ts will be /api/v1/mess-providers
// wait, the PRD says the routes are under /mess-providers/:id/menus
// So router is mounted on /mess-providers in app.ts?
// Wait, no. App registration will likely be app.use('/api/v1/mess-providers', messRoutes);
// We can combine them or mount menu routes differently. I will export a router that expects mergeParams if mounted under messRoutes,
// OR mount it as /api/v1/menus, but PRD says `/mess-providers/:id/menus`.
// Let's use mergeParams: true in Router.
const router = Router({ mergeParams: true });

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
 *         schema: { type: 'string', format: 'uuid' }
 *     responses:
 *       200:
 *         description: Today's menus
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean' }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Menu' }
 */
router.get('/today', validate(menuParamsSchema), asyncHandler(menuController.getToday));

router.get('/', validate({ ...menuParamsSchema, ...getMenuRangeSchema }), asyncHandler(menuController.getByRange));

// Protected routes
router.use(authenticate, authorize('mess_owner'));

/**
 * @openapi
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
 *         schema: { type: 'string', format: 'uuid' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date, mealSlot, items]
 *             properties:
 *               date:      { type: 'string', format: 'date', example: '2026-04-01' }
 *               mealSlot:  { type: 'string', enum: [breakfast, lunch, dinner] }
 *               items:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/MenuItem' }
 *               isHoliday: { type: 'boolean', default: false }
 *               photoUrl:  { type: 'string', nullable: true }
 *     responses:
 *       200:
 *         description: Menu upserted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean' }
 *                 data: { $ref: '#/components/schemas/Menu' }
 */
router.put('/', validate({ ...menuParamsSchema, ...upsertMenuSchema }), asyncHandler(menuController.upsert));

router.delete('/:menuId', validate(menuParamsSchema), asyncHandler(menuController.deleteMenu));

export default router;
