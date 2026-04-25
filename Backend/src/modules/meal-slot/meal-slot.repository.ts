import prisma from '../../config/database.js';
import type { MealSlotListQuery } from './meal-slot.types.js';

export const mealSlotRepository = {
  /**
   * List meal slots for a subscription with ownership check via relation filter.
   */
  async findBySubscription(
    subscriptionId: string,
    userId: string,
    opts: MealSlotListQuery,
  ) {
    const { from, to, status, cursor, limit } = opts;

    const where: Record<string, unknown> = {
      subscriptionId,
      subscription: { userId }, // Ownership via relation filter
    };

    if (from && to) {
      where.date = { gte: new Date(from), lte: new Date(to) };
    } else if (from) {
      where.date = { gte: new Date(from) };
    } else if (to) {
      where.date = { lte: new Date(to) };
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    const slots = await prisma.subscriptionMealSlot.findMany({
      where,
      orderBy: { date: 'asc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = slots.length > limit;
    if (hasMore) slots.pop();

    return {
      items: slots,
      cursor: slots.length > 0 ? slots[slots.length - 1]!.id : null,
      hasMore,
    };
  },

  /**
   * Find a single meal slot with ownership check, including the parent subscription.
   */
  async findByIdWithOwnership(slotId: string, userId: string) {
    return prisma.subscriptionMealSlot.findFirst({
      where: {
        id: slotId,
        subscription: { userId },
      },
      include: { subscription: true },
    });
  },

  /**
   * Atomically cancel a meal slot, credit the wallet, and create a wallet transaction.
   */
  async cancelSlot(
    slotId: string,
    userId: string,
    creditAmount: number,
    reason?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const slot = await tx.subscriptionMealSlot.update({
        where: { id: slotId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelReason: reason || 'Meal cancelled by user',
          creditIssued: creditAmount,
        },
      });

      const wallet = await tx.creditWallet.update({
        where: { userId },
        data: { balance: { increment: creditAmount } },
      });

      await tx.walletTransaction.create({
        data: {
          userId,
          amount: creditAmount,
          type: 'credit',
          reason: `Meal cancelled on ${slot.date.toISOString().split('T')[0]}`,
          referenceId: slotId,
        },
      });

      return {
        slot,
        walletBalance: Number(wallet.balance),
      };
    });
  },
};
