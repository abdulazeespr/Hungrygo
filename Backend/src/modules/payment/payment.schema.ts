import { z } from 'zod/v4';

export const verifyPaymentSchema = {
  body: z.object({
    razorpayOrderId: z.string(),
    razorpayPaymentId: z.string(),
    razorpaySignature: z.string(),
  }),
};

export const listPaymentsSchema = {
  query: z.object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().min(1).max(50).default(20),
  }),
};
