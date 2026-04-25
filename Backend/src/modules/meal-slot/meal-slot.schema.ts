import { z } from 'zod/v4';

export const cancelMealSlotSchema = {
  params: z.object({
    slotId: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().max(500).optional(),
  }),
};

export const mealSlotParamsSchema = {
  params: z.object({
    slotId: z.string().uuid(),
  }),
};
