import { messRepository } from './mess.repository.js';
import type { CreateMessDto, UpdateMessDto, UpsertPlanDto, GetNearbyQuery } from './mess.types.js';
import { HttpError } from '../../shared/errors/HttpError.js';
import { ErrorCodes } from '../../shared/errors/errorCodes.js';
import redis from '../../config/redis.js';

export const messService = {
  async getNearby(params: GetNearbyQuery) {
    const cacheKey = `hungrygo:mess:nearby:${JSON.stringify(params)}`;
    if (!params.cursor) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const data = await messRepository.findNearby(params);
    
    if (!params.cursor) {
      await redis.set(cacheKey, JSON.stringify(data), 'EX', 300);
    }
    
    return data;
  },

  async getById(id: string) {
    const cacheKey = `hungrygo:mess:${id}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const mess = await messRepository.findById(id);
    if (!mess) throw new HttpError(404, ErrorCodes.MESS_NOT_FOUND, 'Mess not found');

    await redis.set(cacheKey, JSON.stringify(mess), 'EX', 600);
    return mess;
  },

  async registerMess(ownerId: string, data: CreateMessDto) {
    return messRepository.create(ownerId, data);
  },

  async verifyOwnership(messId: string, userId: string) {
    const mess = await messRepository.findById(messId);
    if (!mess) throw new HttpError(404, ErrorCodes.MESS_NOT_FOUND, 'Mess not found');
    if (mess.ownerId !== userId) {
      throw new HttpError(403, ErrorCodes.MESS_OWNER_MISMATCH, 'You do not own this mess');
    }
    return mess;
  },

  async updateMess(id: string, userId: string, data: UpdateMessDto) {
    await this.verifyOwnership(id, userId);
    
    const updated = await messRepository.update(id, data);
    
    await redis.del(`hungrygo:mess:${id}`);
    const stream = redis.scanStream({ match: 'hungrygo:mess:nearby:*', count: 100 });
    stream.on('data', (keys: string[]) => {
      if (keys.length) redis.del(...keys);
    });

    return updated;
  },

  async getPlans(messId: string) {
    const mess = await messRepository.findById(messId);
    if (!mess) throw new HttpError(404, ErrorCodes.MESS_NOT_FOUND, 'Mess not found');
    return messRepository.findPlansByMess(messId);
  },

  async upsertPlan(messId: string, userId: string, data: UpsertPlanDto) {
    await this.verifyOwnership(messId, userId);
    return messRepository.upsertPlan(messId, data);
  },
};
