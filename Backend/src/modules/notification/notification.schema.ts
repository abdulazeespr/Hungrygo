import { z } from 'zod/v4';

export const registerTokenSchema = {
  body: z.object({
    token: z.string(),
    platform: z.enum(['web', 'android', 'ios']),
  }),
};

export const deleteTokenSchema = {
  params: z.object({
    token: z.string(),
  }),
};

export const listNotificationsSchema = {
  query: z.object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().min(1).max(50).default(20),
  }),
};

export const readNotificationSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};
