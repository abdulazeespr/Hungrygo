import prisma from '../../config/database.js';
import type { SubscriberListQuery, EarningsQuery } from './owner.types.js';

export const ownerRepository = {
  async getDashboardStats(messId: string) {
    const [subCount, reviewAgg] = await Promise.all([
      prisma.subscription.count({
        where: { messId, status: 'active' },
      }),
      prisma.review.aggregate({
        where: { messId, isVisible: true },
        _avg: { rating: true },
        _count: { id: true },
      }),
    ]);

    return {
      activeSubscriptions: subCount,
      avgRating: reviewAgg._avg.rating ? Number(reviewAgg._avg.rating) : 0,
      totalReviews: reviewAgg._count.id,
    };
  },

  async getSubscribers(opts: SubscriberListQuery) {
    const { messId, status, cursor, limit } = opts;
    
    const where: any = { messId };
    if (status && status !== 'all') {
      where.status = status;
    }

    const subscriptions = await prisma.subscription.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, phone: true } },
        plan: { select: { mealSlot: true, durationType: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = subscriptions.length > limit;
    if (hasMore) subscriptions.pop();

    return {
      items: subscriptions,
      cursor: subscriptions.length > 0 ? subscriptions[subscriptions.length - 1]!.id : null,
      hasMore,
    };
  },

  async getHeadcountFallback(messId: string, date: Date) {
    // Group by mealSlot for a given date where status = 'scheduled'
    const results = await prisma.subscriptionMealSlot.groupBy({
      by: ['mealSlot'],
      where: {
        subscription: { messId },
        date,
        status: 'scheduled',
      },
      _count: { id: true },
    });

    const countMap: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0 };
    for (const r of results) {
      countMap[r.mealSlot] = r._count.id;
    }

    return countMap;
  },

  async getEarnings(opts: EarningsQuery) {
    const { messId, from, to } = opts;

    // Use queryRaw for grouping earnings by day
    // We sum the payments that are captured for this mess
    const sql = `
      SELECT
        DATE("payments"."created_at") as date,
        SUM("payments"."amount") + SUM("payments"."wallet_amount_used") as total_revenue
      FROM "payments"
      JOIN "subscriptions" ON "payments"."subscription_id" = "subscriptions"."id"
      WHERE "subscriptions"."mess_id" = $1::uuid
        AND "payments"."status" = 'captured'
        AND "payments"."created_at" >= $2::timestamp
        AND "payments"."created_at" <= $3::timestamp
      GROUP BY DATE("payments"."created_at")
      ORDER BY date ASC;
    `;

    const results: any[] = await prisma.$queryRawUnsafe(
      sql,
      messId,
      new Date(from + 'T00:00:00.000Z'),
      new Date(to + 'T23:59:59.999Z')
    );

    return results.map((r) => ({
      date: r.date.toISOString().split('T')[0],
      totalRevenue: Number(r.total_revenue),
    }));
  },
};
