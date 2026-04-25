import { z } from 'zod/v4';

export const createPromoSchema = {
  body: z.object({
    code: z.string().min(3).max(20).toUpperCase(),
    description: z.string().optional(),
    discountType: z.enum(['flat', 'percent']),
    discountValue: z.number().positive(),
    maxUses: z.number().int().positive().optional(),
    minOrderAmount: z.number().min(0).default(0),
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
};

export const validatePromoSchema = {
  body: z.object({
    code: z.string().max(20).toUpperCase(),
    amount: z.number().positive(),
  }),
};
