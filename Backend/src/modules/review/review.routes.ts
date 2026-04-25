import { Router } from 'express';
import { reviewController } from './review.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { createReviewSchema, listReviewsSchema } from './review.schema.js';

const router = Router({ mergeParams: true });

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
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: List of reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { type: object }
 */
router.get('/', validate(listReviewsSchema), asyncHandler(reviewController.listReviews));

/**
 * @openapi
 * /mess-providers/{id}/reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Create or update a review
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
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string }
 *     responses:
 *       201:
 *         description: Review created
 */
router.post(
  '/',
  authenticate,
  validate(createReviewSchema),
  asyncHandler(reviewController.createReview)
);

export default router;
