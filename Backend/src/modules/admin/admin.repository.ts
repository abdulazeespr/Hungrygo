import prisma from '../../config/database.js';
import type { ListUsersQuery, ListMessesQuery } from './admin.types.js';

export const adminRepository = {
  async listUsers(opts: ListUsersQuery) {
    const { role, cursor, limit } = opts;
    const users = await prisma.user.findMany({
      where: role ? { role: role as any } : {},
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = users.length > limit;
    if (hasMore) users.pop();
    
    return {
      items: users,
      cursor: users.length > 0 ? users[users.length - 1]!.id : null,
      hasMore,
    };
  },

  async listMesses(opts: ListMessesQuery) {
    const { status, cursor, limit } = opts;
    const messes = await prisma.messProvider.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = messes.length > limit;
    if (hasMore) messes.pop();
    
    return {
      items: messes,
      cursor: messes.length > 0 ? messes[messes.length - 1]!.id : null,
      hasMore,
    };
  },

  async updateMessStatus(id: string, status: any) {
    return prisma.messProvider.update({
      where: { id },
      data: { status },
    });
  },

  async getPlatformMetrics() {
    const [userCount, messCount, subCount, revenueAgg] = await Promise.all([
      prisma.user.count(),
      prisma.messProvider.count(),
      prisma.subscription.aggregate({ _count: { id: true } }),
      prisma.payment.aggregate({
        where: { status: 'captured' },
        _sum: { amount: true, walletAmountUsed: true },
      }),
    ]);

    return {
      totalUsers: userCount,
      totalMesses: messCount,
      totalSubscriptions: subCount._count.id,
      totalRevenue: Number(revenueAgg._sum.amount || 0) + Number(revenueAgg._sum.walletAmountUsed || 0),
    };
  },
};
