import { notificationRepository } from './notification.repository.js';
import { notificationQueue } from '../../jobs/queue.js';
import { HttpError } from '../../shared/errors/HttpError.js';
import type { RegisterTokenDto, NotificationListQuery } from './notification.types.js';
import type { NotificationType } from '../../generated/prisma/client.js';

export const notificationService = {
  async registerToken(userId: string, dto: RegisterTokenDto) {
    await notificationRepository.registerToken(userId, dto.token, dto.platform);
    return { success: true };
  },

  async deleteToken(userId: string, token: string) {
    const res = await notificationRepository.deleteToken(userId, token);
    if (res.count === 0) {
      throw new HttpError(404, 'NOT_FOUND', 'Token not found.');
    }
    return { success: true };
  },

  async listNotifications(userId: string, opts: NotificationListQuery) {
    const result = await notificationRepository.listNotifications(userId, opts);
    return {
      items: result.items.map((n: any) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        payload: n.payload,
        isRead: n.isRead,
        sentAt: n.sentAt,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  },

  async markAsRead(id: string, userId: string) {
    try {
      const notif = await notificationRepository.markAsRead(id, userId);
      return { id: notif.id, isRead: notif.isRead, readAt: notif.readAt };
    } catch {
      throw new HttpError(404, 'NOT_FOUND', 'Notification not found.');
    }
  },

  async enqueueNotification(userId: string, type: NotificationType, title: string, body: string, payload: any = {}) {
    await notificationQueue.add(
      'send_notification',
      { userId, type, title, body, payload },
      { removeOnComplete: true, attempts: 3 }
    );
  }
};
