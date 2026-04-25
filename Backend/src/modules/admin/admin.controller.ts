import type { Request, Response } from 'express';
import { adminService } from './admin.service.js';
import { success, paginated } from '../../shared/utils/response.js';

export const adminController = {
  async listUsers(req: Request, res: Response) {
    const { role, cursor, limit = '30' } = req.query as Record<string, string>;
    const result = await adminService.listUsers({
      role,
      cursor,
      limit: parseInt(limit, 10),
    });
    return paginated(res, result.items, result.cursor, result.hasMore);
  },

  async listMesses(req: Request, res: Response) {
    const { status, cursor, limit = '30' } = req.query as Record<string, string>;
    const result = await adminService.listMesses({
      status,
      cursor,
      limit: parseInt(limit, 10),
    });
    return paginated(res, result.items, result.cursor, result.hasMore);
  },

  async updateMessStatus(req: Request, res: Response) {
    const data = await adminService.updateMessStatus(req.params.id as string, req.body.status);
    return success(res, data);
  },

  async getPlatformMetrics(_req: Request, res: Response) {
    const data = await adminService.getPlatformMetrics();
    return success(res, data);
  },
};
