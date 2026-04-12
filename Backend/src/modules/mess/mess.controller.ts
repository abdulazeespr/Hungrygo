import type { Request, Response } from 'express';
import { messService } from './mess.service.js';
import { success } from '../../shared/utils/response.js';

export const messController = {
  async getNearby(req: Request, res: Response) {
    const data = await messService.getNearby(req.query as any);
    // Return a meta object too based on PRD
    return success(res, data, 200, { cursor: null, has_more: false });
  },

  async getById(req: Request, res: Response) {
    const data = await messService.getById(req.params.id as string);
    return success(res, data);
  },

  async registerMess(req: Request, res: Response) {
    const data = await messService.registerMess(req.user!.id, req.body);
    return success(res, data, 201);
  },

  async updateMess(req: Request, res: Response) {
    const data = await messService.updateMess(req.params.id as string, req.user!.id, req.body);
    return success(res, data);
  },

  async getPlans(req: Request, res: Response) {
    const data = await messService.getPlans(req.params.id as string);
    return success(res, data);
  },

  async upsertPlan(req: Request, res: Response) {
    const data = await messService.upsertPlan(req.params.id as string, req.user!.id, req.body);
    return success(res, data);
  },
};
