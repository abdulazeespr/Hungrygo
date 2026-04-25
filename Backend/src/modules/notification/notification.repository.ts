import prisma from '../../config/database.js';

export const notificationRepository = {
  async registerToken(userId: string, token: string, platform: any) {
    return prisma.notificationToken.upsert({
      where: { token },
      update: { userId, platform, isActive: true },
      create: { userId, token, platform },
    });
  },

  async deleteToken(userId: string, token: string) {
    return prisma.notificationToken.deleteMany({
      where: { userId, token },
    });
  },

  async listNotifications(userId: string, opts: { cursor?: string; limit: number }) {
    const { cursor, limit } = opts;
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = notifications.length > limit;
    if (hasMore) notifications.pop();

    return {
      items: notifications,
      cursor: notifications.length > 0 ? notifications[notifications.length - 1]!.id : null,
      hasMore,
    };
  },

  async markAsRead(id: string, userId: string) {
    return prisma.notification.update({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
  },
};
