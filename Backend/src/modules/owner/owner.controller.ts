import type { Request, Response } from 'express';
import { ownerService } from './owner.service.js';
import { success, paginated } from '../../shared/utils/response.js';

export const ownerController = {
  async getDashboard(req: Request, res: Response) {
    const data = await ownerService.getDashboard(req.user!.id, req.query.messId as string);
    return success(res, data);
  },

  async getSubscribers(req: Request, res: Response) {
    const { messId, status, cursor, limit = '30' } = req.query as Record<string, string>;
    const result = await ownerService.getSubscribers(req.user!.id, {
      messId,
      status: status as any,
      cursor,
      limit: parseInt(limit, 10),
    });
    return paginated(res, result.items, result.cursor, result.hasMore);
  },

  async getHeadcount(req: Request, res: Response) {
    const data = await ownerService.getHeadcount(req.user!.id, {
      messId: req.query.messId as string,
      date: req.query.date as string,
    });
    return success(res, data);
  },

  async getEarnings(req: Request, res: Response) {
    const data = await ownerService.getEarnings(req.user!.id, {
      messId: req.query.messId as string,
      from: req.query.from as string,
      to: req.query.to as string,
    });
    return success(res, data);
  },
};
