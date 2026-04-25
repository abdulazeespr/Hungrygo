import { reviewRepository } from './review.repository.js';
import { HttpError } from '../../shared/errors/HttpError.js';
import { ErrorCodes } from '../../shared/errors/errorCodes.js';
import type { CreateReviewDto, ReviewListQuery } from './review.types.js';

export const reviewService = {
  async createReview(userId: string, messId: string, dto: CreateReviewDto) {
    const hasHistory = await reviewRepository.hasSubscriptionHistory(userId, messId);
    if (!hasHistory) {
      throw new HttpError(403, ErrorCodes.REVIEW_NOT_ALLOWED, 'You must have a subscription history with this mess to leave a review.');
    }

    const review = await reviewRepository.create(userId, messId, dto);
    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
    };
  },

  async listReviews(messId: string, opts: ReviewListQuery) {
    const result = await reviewRepository.getReviewsForMess(messId, opts);
    return {
      items: result.items.map((r: any) => ({
        id: r.id,
        user: r.user,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  },
};
