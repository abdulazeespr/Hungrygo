import type { Request, Response } from 'express';
import { mealSlotService } from './meal-slot.service.js';
import { success, paginated } from '../../shared/utils/response.js';

export const mealSlotController = {
  /**
   * List meal slots for a subscription.
   * Called from subscription.routes.ts  GET /subscriptions/:id/meal-slots
   */
  async list(req: Request, res: Response) {
    const { from, to, status, cursor, limit = '30' } = req.query as Record<string, string>;
    const result = await mealSlotService.listBySubscription(
      req.params.id as string,
      req.user!.id,
      { from, to, status, cursor, limit: parseInt(limit, 10) },
    );
    return paginated(res, result.items, result.cursor, result.hasMore);
  },

  /**
   * Cancel a single meal slot.
   * Called from meal-slot.routes.ts  PATCH /meal-slots/:slotId/cancel
   */
  async cancel(req: Request, res: Response) {
    const data = await mealSlotService.cancelMeal(
      req.params.slotId as string,
      req.user!.id,
      req.body.reason,
    );
    return success(res, data);
  },
};
