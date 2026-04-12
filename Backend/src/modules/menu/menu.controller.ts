import type { Request, Response } from 'express';
import { menuService } from './menu.service.js';
import { success } from '../../shared/utils/response.js';

export const menuController = {
  async getToday(req: Request, res: Response) {
    const data = await menuService.getToday(req.params.id as string);
    return success(res, data);
  },

  async getByRange(req: Request, res: Response) {
    const { from, to } = req.query as { from: string; to: string };
    const data = await menuService.getByRange(req.params.id as string, from, to);
    return success(res, data);
  },

  async upsert(req: Request, res: Response) {
    const data = await menuService.upsert(req.params.id as string, req.user!.id, req.body);
    return success(res, data);
  },

  async deleteMenu(req: Request, res: Response) {
    await menuService.delete(req.params.id as string, req.params.menuId as string, req.user!.id);
    return success(res, { message: 'Menu deleted' });
  },
};
