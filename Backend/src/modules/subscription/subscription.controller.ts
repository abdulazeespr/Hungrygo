import type { Request, Response } from 'express';
import { subscriptionService } from './subscription.service.js';
import { success, paginated } from '../../shared/utils/response.js';

export const subscriptionController = {
  async list(req: Request, res: Response) {
    const { status, cursor, limit = '10' } = req.query as Record<string, string>;
    const result = await subscriptionService.list(req.user!.id, {
      status,
      cursor,
      limit: parseInt(limit, 10),
    });
    return paginated(res, result.items, result.cursor, result.hasMore);
  },

  async getById(req: Request, res: Response) {
    const { from, to } = req.query as Record<string, string>;
    const data = await subscriptionService.getById(req.params.id as string, req.user!.id, { from, to });
    return success(res, data);
  },

  async create(req: Request, res: Response) {
    const data = await subscriptionService.create(req.user!.id, req.body);
    return success(res, data, 201);
  },

  async pause(req: Request, res: Response) {
    const data = await subscriptionService.pause(req.params.id as string, req.user!.id, req.body);
    return success(res, data);
  },

  async cancel(req: Request, res: Response) {
    const data = await subscriptionService.cancel(req.params.id as string, req.user!.id, req.body);
    return success(res, data);
  },
};
