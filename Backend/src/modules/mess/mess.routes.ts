import { Router } from 'express';
import { messController } from './mess.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { 
  createMessSchema, 
  updateMessSchema, 
  getNearbySchema, 
  upsertPlanSchema, 
  messParamsSchema 
} from './mess.schema.js';

const router = Router();

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
 *         schema: { type: 'number', example: 18.5204 }
 *       - in: query
 *         name: lng
 *         required: true
 *         schema: { type: 'number', example: 73.8567 }
 *       - in: query
 *         name: radius_km
 *         schema: { type: 'number', default: 5, minimum: 0.5, maximum: 50 }
 *       - in: query
 *         name: dietary_type
 *         schema: { type: 'string', enum: ['veg', 'non_veg', 'both', 'all'], default: 'all' }
 *       - in: query
 *         name: sort
 *         schema: { type: 'string', enum: ['distance', 'rating', 'price'], default: 'distance' }
 *       - in: query
 *         name: limit
 *         schema: { type: 'integer', default: 20, minimum: 1, maximum: 50 }
 *       - in: query
 *         name: cursor
 *         schema: { type: 'string' }
 *     responses:
 *       200:
 *         description: Nearby mess providers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean' }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/MessWithDistance' }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     cursor:   { type: 'string', nullable: true }
 *                     has_more: { type: 'boolean' }
 */
router.get('/', validate(getNearbySchema), asyncHandler(messController.getNearby));

/**
 * @openapi
 * /mess-providers/{id}:
 *   get:
 *     tags: [Mess]
 *     summary: Get mess detail with pricing plans
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string', format: 'uuid' }
 *     responses:
 *       200:
 *         description: Mess detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean' }
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
 */
router.get('/:id', validate(messParamsSchema), asyncHandler(messController.getById));

// Protected Owner Routes
router.use(authenticate);

router.post(
  '/',
  authorize('mess_owner'),
  validate(createMessSchema),
  asyncHandler(messController.registerMess)
);

router.patch(
  '/:id',
  authorize('mess_owner'),
  validate({ ...messParamsSchema, ...updateMessSchema }),
  asyncHandler(messController.updateMess)
);

router.get('/:id/plans', validate(messParamsSchema), asyncHandler(messController.getPlans));

/**
 * @openapi
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
 *         schema: { type: 'string', format: 'uuid' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mealSlot, durationType, price]
 *             properties:
 *               mealSlot:     { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'full_day'] }
 *               durationType: { type: 'string', enum: ['daily', 'weekly', 'monthly'] }
 *               price:        { type: 'number', example: 2200 }
 *     responses:
 *       200:
 *         description: Plan upserted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean' }
 *                 data: { $ref: '#/components/schemas/PricingPlan' }
 */
router.post(
  '/:id/plans',
  authorize('mess_owner'),
  validate({ ...messParamsSchema, ...upsertPlanSchema }),
  asyncHandler(messController.upsertPlan)
);

export default router;
