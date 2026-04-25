import { z } from 'zod/v4';

const baseSchema = {
  messId: z.string().uuid(),
};

export const dashboardSchema = {
  query: z.object(baseSchema),
};

export const subscribersSchema = {
  query: z.object({
    ...baseSchema,
    status: z.enum(['active', 'paused', 'cancelled', 'expired', 'pending_payment', 'all']).default('all'),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().min(1).max(100).default(30),
  }),
};

export const headcountSchema = {
  query: z.object({
    ...baseSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  }),
};

export const earningsSchema = {
  query: z.object({
    ...baseSchema,
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  }).refine((data) => new Date(data.from) <= new Date(data.to), {
    message: "'from' date must be before or equal to 'to' date",
  }),
};
