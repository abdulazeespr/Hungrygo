import { z } from 'zod/v4';

export const listUsersSchema = {
  query: z.object({
    role: z.enum(['customer', 'mess_owner', 'admin']).optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().min(1).max(100).default(30),
  }),
};

export const listMessesSchema = {
  query: z.object({
    status: z.enum(['pending', 'active', 'suspended', 'closed']).optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().min(1).max(100).default(30),
  }),
};

export const updateMessStatusSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum(['active', 'suspended', 'closed']),
  }),
};
