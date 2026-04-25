import type { Request, Response } from 'express';
import { notificationService } from './notification.service.js';
import { success, paginated } from '../../shared/utils/response.js';

export const notificationController = {
  async registerToken(req: Request, res: Response) {
    await notificationService.registerToken(req.user!.id, req.body);
    return success(res, { message: 'Token registered successfully' }, 201);
  },

  async deleteToken(req: Request, res: Response) {
    await notificationService.deleteToken(req.user!.id, req.params.token as string);
    return success(res, { message: 'Token removed' });
  },

  async listNotifications(req: Request, res: Response) {
    const { cursor, limit = '20' } = req.query as Record<string, string>;
    const result = await notificationService.listNotifications(req.user!.id, {
      cursor,
      limit: parseInt(limit, 10),
    });
    return paginated(res, result.items, result.cursor, result.hasMore);
  },

  async markAsRead(req: Request, res: Response) {
    const data = await notificationService.markAsRead(req.params.id as string, req.user!.id);
    return success(res, data);
  },
};
