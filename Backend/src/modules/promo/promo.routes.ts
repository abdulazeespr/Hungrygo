import { Router } from 'express';
import { promoController } from './promo.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { createPromoSchema, validatePromoSchema } from './promo.schema.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Promos
 *     description: Promotional codes
 *   - name: Admin
 *     description: Administrative routes
 */

/**
 * @openapi
 * /promos/validate:
 *   post:
 *     tags: [Promos]
 *     summary: Validate a promo code and calculate discount
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  '/validate',
  authenticate,
  validate(validatePromoSchema),
  asyncHandler(promoController.validatePromo)
);

/**
 * @openapi
 * /promos:
 *   post:
 *     tags: [Admin]
 *     summary: Create a new promo code
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate(createPromoSchema),
  asyncHandler(promoController.createPromo)
);

export default router;
