import { mealSlotRepository } from './meal-slot.repository.js';
import { subscriptionRepository } from '../subscription/subscription.repository.js';
import { HttpError } from '../../shared/errors/HttpError.js';
import { ErrorCodes } from '../../shared/errors/errorCodes.js';
import redis from '../../config/redis.js';
import type { MealSlotListQuery } from './meal-slot.types.js';

export const mealSlotService = {
  async listBySubscription(
    subscriptionId: string,
    userId: string,
    opts: MealSlotListQuery,
  ) {
    const result = await mealSlotRepository.findBySubscription(subscriptionId, userId, opts);

    return {
      items: result.items.map((s) => ({
        id: s.id,
        date: s.date,
        mealSlot: s.mealSlot,
        status: s.status,
        creditIssued: Number(s.creditIssued),
        cancelledAt: s.cancelledAt,
        cancelReason: s.cancelReason,
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  },

  async cancelMeal(slotId: string, userId: string, reason?: string) {
    // 1. Find slot with ownership check
    const slot = await mealSlotRepository.findByIdWithOwnership(slotId, userId);
    if (!slot) {
      throw new HttpError(404, ErrorCodes.MEAL_SLOT_NOT_FOUND, 'Meal slot not found.');
    }

    // 2. Verify slot is still scheduled
    if (slot.status !== 'scheduled') {
      throw new HttpError(
        409,
        ErrorCodes.MEAL_SLOT_ALREADY_CANCELLED,
        'This meal slot has already been cancelled or is not in a scheduled state.',
      );
    }

    // 3. 24-hour window check
    const mealDateTime = new Date(slot.date);
    const now = new Date();
    const hoursUntilMeal = (mealDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilMeal < 24) {
      throw new HttpError(
        422,
        ErrorCodes.MEAL_SLOT_WINDOW_EXPIRED,
        'Meal slots can only be cancelled 24 hours in advance.',
      );
    }

    // 4. Calculate credit: totalAmount / totalSlotsCount
    const totalSlots = await subscriptionRepository.getTotalSlotCount(slot.subscriptionId);
    const creditAmount = totalSlots > 0
      ? parseFloat((Number(slot.subscription.totalAmount) / totalSlots).toFixed(2))
      : 0;

    // 5. Atomic cancel + wallet credit
    const result = await mealSlotRepository.cancelSlot(slotId, userId, creditAmount, reason);

    // 6. DECR Redis headcount
    const dateStr = slot.date.toISOString().split('T')[0];
    const headcountKey = `hungrygo:headcount:${slot.subscription.messId}:${dateStr}:${slot.mealSlot}`;
    await redis.decr(headcountKey);

    return {
      slotId: result.slot.id,
      status: result.slot.status,
      creditIssued: creditAmount,
      walletBalance: result.walletBalance,
      message: `Meal cancelled. ₹${creditAmount.toFixed(2)} credited to your wallet.`,
    };
  },
};
