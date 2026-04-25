import { subscriptionRepository } from './subscription.repository.js';
import { messRepository } from '../mess/mess.repository.js';
import { HttpError } from '../../shared/errors/HttpError.js';
import { ErrorCodes } from '../../shared/errors/errorCodes.js';
import redis from '../../config/redis.js';
import type { MealSlot } from '../../generated/prisma/client.js';
import type {
  CreateSubscriptionDto,
  PauseSubscriptionDto,
  CancelSubscriptionDto,
  MealSlotDateEntry,
  SubscriptionListQuery,
  SubscriptionDetailQuery,
} from './subscription.types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Calculate end date based on duration type.
 * daily → same day, weekly → +6 days, monthly → +29 days
 */
function calculateEndDate(startDate: Date, durationType: string): Date {
  const end = new Date(startDate);
  switch (durationType) {
    case 'daily':
      break; // same day
    case 'weekly':
      end.setDate(end.getDate() + 6);
      break;
    case 'monthly':
      end.setDate(end.getDate() + 29);
      break;
  }
  return end;
}

/**
 * Generate individual meal slot date entries between start and end (inclusive).
 * full_day → 3 rows per day (breakfast, lunch, dinner), else 1 row/day.
 */
function generateSlotDates(
  startDate: Date,
  endDate: Date,
  mealSlot: MealSlot,
): MealSlotDateEntry[] {
  const slots: MealSlotDateEntry[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    if (mealSlot === 'full_day') {
      slots.push(
        { date: new Date(current), slot: 'breakfast' },
        { date: new Date(current), slot: 'lunch' },
        { date: new Date(current), slot: 'dinner' },
      );
    } else {
      slots.push({ date: new Date(current), slot: mealSlot });
    }
    current.setDate(current.getDate() + 1);
  }

  return slots;
}

/**
 * Build the Redis headcount key for a mess/date/slot.
 */
function headcountKey(messId: string, date: Date, slot: string): string {
  const dateStr = date.toISOString().split('T')[0];
  return `hungrygo:headcount:${messId}:${dateStr}:${slot}`;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const subscriptionService = {
  async list(userId: string, opts: SubscriptionListQuery) {
    const result = await subscriptionRepository.findByUser(userId, opts);

    return {
      items: result.items.map((sub) => ({
        id: sub.id,
        mess: sub.mess,
        mealSlot: sub.mealSlot,
        durationType: sub.durationType,
        startDate: sub.startDate,
        endDate: sub.endDate,
        status: sub.status,
        autoRenew: sub.autoRenew,
        totalAmount: Number(sub.totalAmount),
        cancelledSlots: sub._count.mealSlots,
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  },

  async getById(id: string, userId: string, opts: SubscriptionDetailQuery) {
    const sub = await subscriptionRepository.findByIdForUser(id, userId, opts);
    if (!sub) {
      throw new HttpError(404, ErrorCodes.SUB_NOT_FOUND, 'Subscription not found.');
    }

    return {
      id: sub.id,
      mess: sub.mess,
      mealSlot: sub.mealSlot,
      durationType: sub.durationType,
      startDate: sub.startDate,
      endDate: sub.endDate,
      status: sub.status,
      autoRenew: sub.autoRenew,
      totalAmount: Number(sub.totalAmount),
      calendar: sub.mealSlots.map((s) => ({
        id: s.id,
        date: s.date,
        mealSlot: s.mealSlot,
        status: s.status,
        creditIssued: Number(s.creditIssued),
      })),
    };
  },

  async create(userId: string, dto: CreateSubscriptionDto) {
    // 1. Verify mess exists and is active
    const mess = await messRepository.findById(dto.messId);
    if (!mess) {
      throw new HttpError(404, ErrorCodes.MESS_NOT_FOUND, 'Mess not found.');
    }
    if (mess.status !== 'active') {
      throw new HttpError(422, ErrorCodes.MESS_NOT_ACTIVE, 'Mess is not currently active.');
    }

    // 2. Verify plan belongs to mess, matches mealSlot + durationType
    const plan = mess.pricingPlans.find(
      (p) =>
        p.id === dto.planId &&
        p.mealSlot === dto.mealSlot &&
        p.durationType === dto.durationType,
    );
    if (!plan) {
      throw new HttpError(
        404,
        ErrorCodes.PLAN_NOT_FOUND,
        'Pricing plan not found or does not match the selected meal slot and duration.',
      );
    }

    // 3. Calculate dates and generate slot rows
    const startDate = new Date(dto.startDate);
    const endDate = calculateEndDate(startDate, dto.durationType);
    const slotRows = generateSlotDates(startDate, endDate, dto.mealSlot);
    const totalAmount = Number(plan.price);

    // 4. Create subscription + slots atomically
    //    The partial unique index will cause P2002 if duplicate active sub exists
    let result;
    try {
      result = await subscriptionRepository.createWithSlots(
        {
          userId,
          messId: dto.messId,
          planId: dto.planId,
          mealSlot: dto.mealSlot,
          durationType: dto.durationType,
          startDate,
          endDate,
          totalAmount,
          autoRenew: dto.autoRenew,
        },
        slotRows,
      );
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new HttpError(
          409,
          ErrorCodes.SUB_ALREADY_ACTIVE,
          'You already have an active subscription for this mess and meal slot.',
        );
      }
      throw error;
    }

    // 5. INCR Redis headcounts for each slot
    const pipeline = redis.pipeline();
    for (const slot of slotRows) {
      const key = headcountKey(dto.messId, slot.date, slot.slot);
      pipeline.incr(key);
      pipeline.expire(key, 86400 * 35); // TTL > max subscription window
    }
    await pipeline.exec();

    return {
      subscriptionId: result.sub.id,
      status: result.sub.status,
      startDate: result.sub.startDate,
      endDate: result.sub.endDate,
      totalSlots: result.totalSlots,
      totalAmount,
    };
  },

  async pause(id: string, userId: string, dto: PauseSubscriptionDto) {
    // Verify ownership and that sub is active
    const sub = await subscriptionRepository.findByIdForUser(id, userId, {});
    if (!sub) {
      throw new HttpError(404, ErrorCodes.SUB_NOT_FOUND, 'Subscription not found.');
    }
    if (sub.status !== 'active') {
      throw new HttpError(422, ErrorCodes.SUB_NOT_ACTIVE, 'Only active subscriptions can be paused.');
    }

    const pauseStart = new Date(dto.pauseStart);
    const pauseEnd = new Date(dto.pauseEnd);

    const updated = await subscriptionRepository.pause(id, userId, pauseStart, pauseEnd);

    // DECR Redis headcounts for skipped slots
    const pipeline = redis.pipeline();
    const current = new Date(pauseStart);
    while (current <= pauseEnd) {
      if (sub.mealSlot === 'full_day') {
        for (const slot of ['breakfast', 'lunch', 'dinner'] as const) {
          pipeline.decr(headcountKey(sub.messId, new Date(current), slot));
        }
      } else {
        pipeline.decr(headcountKey(sub.messId, new Date(current), sub.mealSlot));
      }
      current.setDate(current.getDate() + 1);
    }
    await pipeline.exec();

    return {
      id: updated.id,
      status: updated.status,
      pauseStart: updated.pauseStart,
      pauseEnd: updated.pauseEnd,
    };
  },

  async cancel(id: string, userId: string, dto: CancelSubscriptionDto) {
    // Verify ownership and that sub is active or paused
    const sub = await subscriptionRepository.findByIdForUser(id, userId, {});
    if (!sub) {
      throw new HttpError(404, ErrorCodes.SUB_NOT_FOUND, 'Subscription not found.');
    }
    if (sub.status !== 'active' && sub.status !== 'paused') {
      throw new HttpError(
        422,
        ErrorCodes.SUB_NOT_ACTIVE,
        'Only active or paused subscriptions can be cancelled.',
      );
    }

    const result = await subscriptionRepository.cancel(id, userId, dto.reason);

    // DECR Redis headcounts for cancelled future slots
    const pipeline = redis.pipeline();
    const futureSlots = sub.mealSlots.filter(
      (s) => s.status === 'scheduled' && s.date >= new Date(),
    );
    for (const slot of futureSlots) {
      pipeline.decr(headcountKey(sub.messId, slot.date, slot.mealSlot));
    }
    await pipeline.exec();

    return result;
  },
};
