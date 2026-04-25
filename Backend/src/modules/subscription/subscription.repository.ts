import prisma from '../../config/database.js';
import type { MealSlot, DurationType } from '../../generated/prisma/client.js';
import type { MealSlotDateEntry } from './subscription.types.js';

export const subscriptionRepository = {
  /**
   * List subscriptions for a user with cancelled-slot counts and mess info.
   */
  async findByUser(
    userId: string,
    opts: { status?: string; cursor?: string; limit: number },
  ) {
    const { status, cursor, limit } = opts;

    const where: Record<string, unknown> = { userId };
    if (status && status !== 'all') where.status = status;

    const subscriptions = await prisma.subscription.findMany({
      where,
      include: {
        mess: { select: { id: true, name: true, city: true } },
        _count: { select: { mealSlots: { where: { status: 'cancelled' } } } },
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

  /**
   * Get a single subscription with mess info and meal-slot calendar (date filtered).
   */
  async findByIdForUser(
    id: string,
    userId: string,
    opts: { from?: string; to?: string },
  ) {
    const dateFilter: Record<string, unknown> = {};
    if (opts.from) dateFilter.gte = new Date(opts.from);
    if (opts.to) dateFilter.lte = new Date(opts.to);

    return prisma.subscription.findFirst({
      where: { id, userId },
      include: {
        mess: { select: { id: true, name: true } },
        mealSlots: {
          where: {
            ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
          },
          orderBy: { date: 'asc' },
        },
      },
    });
  },

  /**
   * Atomically create subscription and deduct wallet balance.
   */
  async createPendingSubscription(
    subData: {
      userId: string;
      messId: string;
      planId: string;
      mealSlot: MealSlot;
      durationType: DurationType;
      startDate: Date;
      endDate: Date;
      totalAmount: number;
      autoRenew: boolean;
      walletAmountUsed: number;
    }
  ) {
    return prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          userId: subData.userId,
          messId: subData.messId,
          planId: subData.planId,
          mealSlot: subData.mealSlot,
          durationType: subData.durationType,
          startDate: subData.startDate,
          endDate: subData.endDate,
          totalAmount: subData.totalAmount,
          autoRenew: subData.autoRenew,
          status: 'pending_payment',
        },
      });

      if (subData.walletAmountUsed > 0) {
        await tx.creditWallet.update({
          where: { userId: subData.userId },
          data: { balance: { decrement: subData.walletAmountUsed } },
        });

        await tx.walletTransaction.create({
          data: {
            userId: subData.userId,
            amount: subData.walletAmountUsed,
            type: 'debit',
            reason: `Applied to subscription ${sub.id}`,
            referenceId: sub.id,
          },
        });
      } else {
        await tx.creditWallet.upsert({
          where: { userId: subData.userId },
          update: {},
          create: { userId: subData.userId, balance: 0 },
        });
      }

      return sub;
    });
  },

  /**
   * Pause a subscription and skip meals in the pause window.
   */
  async pause(
    id: string,
    userId: string,
    pauseStart: Date,
    pauseEnd: Date,
  ) {
    return prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id },
        data: {
          status: 'paused',
          pauseStart,
          pauseEnd,
        },
      });

      await tx.subscriptionMealSlot.updateMany({
        where: {
          subscriptionId: id,
          date: { gte: pauseStart, lte: pauseEnd },
          status: 'scheduled',
        },
        data: { status: 'skipped' },
      });

      return sub;
    });
  },

  /**
   * Cancel a subscription: mark cancelled, cancel future scheduled slots,
   * calculate credits, update wallet, and log a wallet transaction.
   */
  async cancel(id: string, userId: string, reason?: string) {
    return prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id },
        data: { status: 'cancelled' },
      });

      // Count future scheduled slots that will be cancelled
      const futureSlots = await tx.subscriptionMealSlot.findMany({
        where: {
          subscriptionId: id,
          status: 'scheduled',
          date: { gte: new Date() },
        },
        select: { id: true },
      });

      const totalSlots = await tx.subscriptionMealSlot.count({
        where: { subscriptionId: id },
      });

      const perSlotCredit = totalSlots > 0
        ? Number(sub.totalAmount) / totalSlots
        : 0;
      const totalCredit = parseFloat((perSlotCredit * futureSlots.length).toFixed(2));

      // Cancel the future scheduled slots
      await tx.subscriptionMealSlot.updateMany({
        where: {
          subscriptionId: id,
          status: 'scheduled',
          date: { gte: new Date() },
        },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelReason: reason || 'Subscription cancelled',
          creditIssued: perSlotCredit,
        },
      });

      // Credit wallet if there's anything to refund
      let walletBalance = 0;
      if (totalCredit > 0) {
        const wallet = await tx.creditWallet.update({
          where: { userId },
          data: { balance: { increment: totalCredit } },
        });
        walletBalance = Number(wallet.balance);

        await tx.walletTransaction.create({
          data: {
            userId,
            amount: totalCredit,
            type: 'credit',
            reason: reason
              ? `Subscription cancelled: ${reason}`
              : 'Subscription cancelled',
            referenceId: id,
          },
        });
      } else {
        const wallet = await tx.creditWallet.findUnique({ where: { userId } });
        walletBalance = wallet ? Number(wallet.balance) : 0;
      }

      return {
        subscriptionId: sub.id,
        status: sub.status,
        creditsIssued: totalCredit,
        walletBalance,
        cancelledSlots: futureSlots.length,
      };
    });
  },

  /**
   * Count total meal slots for a subscription (used for per-slot credit calc).
   */
  async getTotalSlotCount(subscriptionId: string) {
    return prisma.subscriptionMealSlot.count({
      where: { subscriptionId },
    });
  },
};
