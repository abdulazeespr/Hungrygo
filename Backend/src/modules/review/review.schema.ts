import { z } from 'zod/v4';

export const createReviewSchema = {
  params: z.object({
    id: z.string().uuid(), // messId
  }),
  body: z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional(),
  }),
};

export const listReviewsSchema = {
  params: z.object({
    id: z.string().uuid(), // messId
  }),
  query: z.object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().min(1).max(50).default(20),
  }),
};
