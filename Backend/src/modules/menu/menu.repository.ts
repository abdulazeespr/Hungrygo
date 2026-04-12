import prisma from '../../config/database.js';
import type { Menu } from '../../generated/prisma/client.js';
import type { UpsertMenuDto } from './menu.types.js';

export const menuRepository = {
  async findByMessAndDate(messId: string, date: Date): Promise<Menu[]> {
    return prisma.menu.findMany({
      where: {
        messId,
        date,
      },
      orderBy: { mealSlot: 'asc' },
    });
  },

  async findByDateRange(messId: string, from: Date, to: Date): Promise<Menu[]> {
    return prisma.menu.findMany({
      where: {
        messId,
        date: {
          gte: from,
          lte: to,
        },
      },
      orderBy: [{ date: 'asc' }, { mealSlot: 'asc' }],
    });
  },

  async upsert(messId: string, data: UpsertMenuDto): Promise<Menu> {
    return prisma.menu.upsert({
      where: {
        messId_date_mealSlot: {
          messId,
          date: new Date(data.date),
          mealSlot: data.mealSlot,
        },
      },
      update: {
        items: data.items as any,
        isHoliday: data.isHoliday,
        photoUrl: data.photoUrl,
      },
      create: {
        messId,
        date: new Date(data.date),
        mealSlot: data.mealSlot,
        items: data.items as any,
        isHoliday: data.isHoliday || false,
        photoUrl: data.photoUrl,
      },
    });
  },

  async deleteById(menuId: string, messId: string): Promise<Menu> {
    return prisma.menu.delete({
      where: { id: menuId, messId },
    });
  },
};
