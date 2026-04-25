import type { Request, Response } from 'express';
import { paymentService } from './payment.service.js';
import { success, paginated } from '../../shared/utils/response.js';

export const paymentController = {
  async verifyPayment(req: Request, res: Response) {
    const data = await paymentService.verifyPayment(req.user!.id, req.body);
    return success(res, data);
  },

  async handleWebhook(req: Request, res: Response) {
    const signature = req.headers['x-razorpay-signature'] as string;
    await paymentService.handleWebhook(req.body, signature);
    // Always return 200 to acknowledge webhook
    res.json({ received: true });
  },

  async getPayments(req: Request, res: Response) {
    const { cursor, limit = '20' } = req.query as Record<string, string>;
    const result = await paymentService.getPayments(req.user!.id, {
      cursor,
      limit: parseInt(limit, 10),
    });
    return paginated(res, result.items, result.cursor, result.hasMore);
  },
};
