import { menuRepository } from './menu.repository.js';
import type { UpsertMenuDto } from './menu.types.js';
import { HttpError } from '../../shared/errors/HttpError.js';
import { ErrorCodes } from '../../shared/errors/errorCodes.js';
import { messRepository } from '../mess/mess.repository.js';
import redis from '../../config/redis.js';

export const menuService = {
  async getToday(messId: string) {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `hungrygo:mess:${messId}:menu:${today}`;
    
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const menus = await menuRepository.findByMessAndDate(messId, new Date(today));
    
    await redis.set(cacheKey, JSON.stringify(menus), 'EX', 3600); // 1 hour caching
    return menus;
  },

  async getByRange(messId: string, fromDateStr: string, toDateStr: string) {
    const from = new Date(fromDateStr);
    const to = new Date(toDateStr);

    const diffDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 3600 * 24));
    if (diffDays > 7 || diffDays < 0) {
      throw new HttpError(400, ErrorCodes.VALIDATION_ERROR, 'Date range allows a maximum of 7 days');
    }

    const menus = await menuRepository.findByDateRange(messId, from, to);
    
    // Group by date
    const grouped = menus.reduce((acc, menu) => {
      const dateStr = menu.date.toISOString().split('T')[0];
      if (!acc[dateStr]) acc[dateStr] = [];
      acc[dateStr].push(menu);
      return acc;
    }, {} as Record<string, typeof menus>);

    return Object.entries(grouped).map(([date, items]) => ({ date, menus: items }));
  },

  async verifyMessOwnership(messId: string, userId: string) {
    const mess = await messRepository.findById(messId);
    if (!mess) throw new HttpError(404, ErrorCodes.MESS_NOT_FOUND, 'Mess not found');
    if (mess.ownerId !== userId) {
      throw new HttpError(403, ErrorCodes.MESS_OWNER_MISMATCH, 'You do not own this mess');
    }
  },

  async upsert(messId: string, userId: string, data: UpsertMenuDto) {
    await this.verifyMessOwnership(messId, userId);
    
    const menu = await menuRepository.upsert(messId, data);
    
    // invalidate cache
    await redis.del(`hungrygo:mess:${messId}:menu:${data.date}`);
    
    return menu;
  },

  async delete(messId: string, menuId: string, userId: string) {
    await this.verifyMessOwnership(messId, userId);
    const deleted = await menuRepository.deleteById(menuId, messId);
    
    await redis.del(`hungrygo:mess:${messId}:menu:${deleted.date.toISOString().split('T')[0]}`);
    
    return deleted;
  },
};
