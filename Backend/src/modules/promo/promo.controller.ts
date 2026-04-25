import type { Request, Response } from 'express';
import { promoService } from './promo.service.js';
import { success } from '../../shared/utils/response.js';

export const promoController = {
  async createPromo(req: Request, res: Response) {
    const data = await promoService.createPromo(req.body);
    return success(res, data, 201);
  },

  async validatePromo(req: Request, res: Response) {
    const data = await promoService.validatePromo(req.user!.id, req.body);
    return success(res, data);
  },
};
