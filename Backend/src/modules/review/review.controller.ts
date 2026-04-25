import type { Request, Response } from 'express';
import { reviewService } from './review.service.js';
import { success, paginated } from '../../shared/utils/response.js';

export const reviewController = {
  async createReview(req: Request, res: Response) {
    const messId = req.params.id as string;
    const data = await reviewService.createReview(req.user!.id, messId, req.body);
    return success(res, data, 201);
  },

  async listReviews(req: Request, res: Response) {
    const messId = req.params.id as string;
    const { cursor, limit = '20' } = req.query as Record<string, string>;
    const result = await reviewService.listReviews(messId, {
      cursor,
      limit: parseInt(limit, 10),
    });
    return paginated(res, result.items, result.cursor, result.hasMore);
  },
};
