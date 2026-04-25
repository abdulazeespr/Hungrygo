import { z } from 'zod/v4';

export const createSubscriptionSchema = {
  body: z.object({
    messId:       z.string().uuid(),
    planId:       z.string().uuid(),
    mealSlot:     z.enum(['breakfast', 'lunch', 'dinner', 'full_day']),
    durationType: z.enum(['daily', 'weekly', 'monthly']),
    startDate:    z.string()
                    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
                    .refine(
                      (d) => new Date(d) >= new Date(new Date().toDateString()),
                      'Start date must be today or in the future',
                    ),
    autoRenew:    z.boolean().default(true),
  }),
};

export const listSubscriptionsSchema = {
  query: z.object({
    status: z.enum(['active', 'paused', 'cancelled', 'expired', 'all']).default('all'),
    cursor: z.string().uuid().optional(),
    limit:  z.coerce.number().min(1).max(50).default(10),
  }),
};

export const getSubscriptionSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
};

export const pauseSubscriptionSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    pauseStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
    pauseEnd:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  }).refine(
    (d) => new Date(d.pauseEnd) >= new Date(d.pauseStart),
    'pauseEnd must be on or after pauseStart',
  ).refine(
    (d) => new Date(d.pauseStart) >= new Date(new Date().toDateString()),
    'pauseStart must be today or in the future',
  ).refine(
    (d) => {
      const diffMs = new Date(d.pauseEnd).getTime() - new Date(d.pauseStart).getTime();
      return diffMs <= 30 * 24 * 60 * 60 * 1000;
    },
    'Maximum pause duration is 30 days',
  ),
};

export const cancelSubscriptionSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().max(500).optional(),
  }),
};

export const subscriptionParamsSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

export const listMealSlotsForSubSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    from:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.enum(['scheduled', 'delivered', 'cancelled', 'skipped', 'all']).default('all'),
    cursor: z.string().uuid().optional(),
    limit:  z.coerce.number().min(1).max(100).default(30),
  }),
};
