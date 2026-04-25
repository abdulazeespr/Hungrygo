import { ownerRepository } from './owner.repository.js';
import { messRepository } from '../mess/mess.repository.js';
import { HttpError } from '../../shared/errors/HttpError.js';
import redis from '../../config/redis.js';
import type { SubscriberListQuery, HeadcountQuery, EarningsQuery } from './owner.types.js';

export const ownerService = {
  async verifyOwnership(userId: string, messId: string) {
    const mess = await messRepository.findById(messId);
    if (!mess || mess.ownerId !== userId) {
      throw new HttpError(403, 'FORBIDDEN', 'Access denied to this mess provider.');
    }
    return mess;
  },

  async getDashboard(userId: string, messId: string) {
    await this.verifyOwnership(userId, messId);
    return ownerRepository.getDashboardStats(messId);
  },

  async getSubscribers(userId: string, opts: SubscriberListQuery) {
    await this.verifyOwnership(userId, opts.messId);
    const result = await ownerRepository.getSubscribers(opts);
    return {
      items: result.items.map((sub: any) => ({
        id: sub.id,
        user: sub.user,
        plan: sub.plan,
        startDate: sub.startDate,
        endDate: sub.endDate,
        status: sub.status,
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  },

  async getHeadcount(userId: string, opts: HeadcountQuery) {
    await this.verifyOwnership(userId, opts.messId);

    const slots = ['breakfast', 'lunch', 'dinner'];
    const countMap: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0 };
    let cacheMiss = false;

    const keys = slots.map(slot => `hungrygo:headcount:${opts.messId}:${opts.date}:${slot}`);
    const results = await redis.mget(keys);

    for (let i = 0; i < slots.length; i++) {
      const val = results[i];
      if (val === null) {
        cacheMiss = true;
        break;
      }
      countMap[slots[i]!] = parseInt(val, 10);
    }

    if (!cacheMiss) {
      return { source: 'redis', date: opts.date, counts: countMap };
    }

    const dbCounts = await ownerRepository.getHeadcountFallback(opts.messId, new Date(opts.date));
    
    // Repopulate redis
    const pipeline = redis.pipeline();
    for (const slot of slots) {
      const key = `hungrygo:headcount:${opts.messId}:${opts.date}:${slot}`;
      pipeline.set(key, dbCounts[slot] || 0, 'EX', 86400 * 35);
    }
    pipeline.exec().catch(() => {});

    return { source: 'database', date: opts.date, counts: dbCounts };
  },

  async getEarnings(userId: string, opts: EarningsQuery) {
    await this.verifyOwnership(userId, opts.messId);
    return ownerRepository.getEarnings(opts);
  },
};
