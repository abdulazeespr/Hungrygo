import type { Request, Response } from 'express';
import { walletService } from './wallet.service.js';
import { success, paginated } from '../../shared/utils/response.js';

export const walletController = {
  async getBalance(req: Request, res: Response) {
    const data = await walletService.getBalance(req.user!.id);
    return success(res, data);
  },

  async getTransactions(req: Request, res: Response) {
    const { type, cursor, limit = '20' } = req.query as Record<string, string>;
    const result = await walletService.getTransactions(req.user!.id, {
      type,
      cursor,
      limit: parseInt(limit, 10),
    });
    return paginated(res, result.items, result.cursor, result.hasMore);
  },
};
