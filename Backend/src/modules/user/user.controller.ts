import type { Request, Response } from 'express';
import { userService } from './user.service.js';
import { success } from '../../shared/utils/response.js';

export const userController = {
  async getMe(req: Request, res: Response) {
    const data = await userService.getMe(req.user!.id);
    return success(res, data);
  },

  async updateMe(req: Request, res: Response) {
    const data = await userService.updateMe(req.user!.id, req.body);
    return success(res, data);
  },

  async createAddress(req: Request, res: Response) {
    const data = await userService.createAddress(req.user!.id, req.body);
    return success(res, data, 201);
  },

  async getAddresses(req: Request, res: Response) {
    const data = await userService.getAddresses(req.user!.id);
    return success(res, data);
  },

  async updateAddress(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    const data = await userService.updateAddress(id, req.user!.id, req.body);
    return success(res, data);
  },

  async deleteAddress(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    await userService.deleteAddress(id, req.user!.id);
    return success(res, { message: 'Address deleted' });
  },
};
