import prisma from '../../config/database.js';
import type { CreateReviewDto, ReviewListQuery } from './review.types.js';

export const reviewRepository = {
  async hasSubscriptionHistory(userId: string, messId: string) {
    const sub = await prisma.subscription.findFirst({
      where: { userId, messId },
    });
    return !!sub;
  },

  async create(userId: string, messId: string, data: CreateReviewDto) {
    return prisma.$transaction(async (tx) => {
      // Create or update review
      const review = await tx.review.upsert({
        where: {
          userId_messId: { userId, messId },
        },
        update: {
          rating: data.rating,
          comment: data.comment,
          createdAt: new Date(), // Reset date on update
        },
        create: {
          userId,
          messId,
          rating: data.rating,
          comment: data.comment,
        },
      });

      // Recalculate average rating
      const agg = await tx.review.aggregate({
        where: { messId, isVisible: true },
        _avg: { rating: true },
        _count: { id: true },
      });

      const avgRating = agg._avg.rating ? Number(agg._avg.rating) : 0;
      const totalReviews = agg._count.id;

      await tx.messProvider.update({
        where: { id: messId },
        data: { avgRating, totalReviews },
      });

      return review;
    });
  },

  async getReviewsForMess(messId: string, opts: ReviewListQuery) {
    const { cursor, limit } = opts;
    const reviews = await prisma.review.findMany({
      where: { messId, isVisible: true },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = reviews.length > limit;
    if (hasMore) reviews.pop();

    return {
      items: reviews,
      cursor: reviews.length > 0 ? reviews[reviews.length - 1]!.id : null,
      hasMore,
    };
  },
};
