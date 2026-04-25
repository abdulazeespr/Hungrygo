import prisma from '../../config/database.js';
import type { MealSlotDateEntry } from '../subscription/subscription.types.js';

export const paymentRepository = {
  async create(data: {
    userId: string;
    subscriptionId: string;
    amount: number;
    walletAmountUsed: number;
    razorpayOrderId: string;
  }) {
    return prisma.payment.create({
      data: {
        userId: data.userId,
        subscriptionId: data.subscriptionId,
        amount: data.amount,
        walletAmountUsed: data.walletAmountUsed,
        status: 'pending',
        razorpayOrderId: data.razorpayOrderId,
      },
    });
  },

  async findByOrderId(razorpayOrderId: string) {
    return prisma.payment.findUnique({
      where: { razorpayOrderId },
      include: { subscription: true },
    });
  },

  async activateSubscription(
    paymentId: string,
    subscriptionId: string,
    razorpayPaymentId: string,
    signature: string,
    slotRows: MealSlotDateEntry[],
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'captured', razorpayPaymentId, razorpaySignature: signature },
      });

      await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'active', paymentId },
      });

      if (slotRows.length > 0) {
        await tx.subscriptionMealSlot.createMany({
          data: slotRows.map(s => ({
            subscriptionId,
            date: s.date,
            mealSlot: s.slot,
          })),
        });
      }

      return tx.subscription.findUnique({
        where: { id: subscriptionId },
        select: { id: true, startDate: true, endDate: true, mealSlots: { select: { id: true } } },
      });
    });
  },

  async failPayment(paymentId: string, subscriptionId: string, reason: string) {
    return prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'failed', failureReason: reason },
      });

      await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'cancelled' },
      });
    });
  },

  async getPayments(userId: string, opts: { cursor?: string; limit: number }) {
    const { cursor, limit } = opts;
    const payments = await prisma.payment.findMany({
      where: { userId },
      include: { subscription: { include: { mess: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = payments.length > limit;
    if (hasMore) payments.pop();

    return {
      items: payments,
      cursor: payments.length > 0 ? payments[payments.length - 1]!.id : null,
      hasMore,
    };
  },
};
