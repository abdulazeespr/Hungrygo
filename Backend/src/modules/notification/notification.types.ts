import type { NotificationPlatform, NotificationType } from '../../generated/prisma/client.js';

export interface RegisterTokenDto {
  token: string;
  platform: NotificationPlatform;
}

export interface NotificationListQuery {
  cursor?: string;
  limit: number;
}
