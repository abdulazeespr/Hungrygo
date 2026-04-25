import { z } from 'zod/v4';

export const getTransactionsSchema = {
  query: z.object({
    type:   z.enum(['credit', 'debit', 'all']).default('all'),
    cursor: z.string().uuid().optional(),
    limit:  z.coerce.number().min(1).max(100).default(20),
  }),
};
