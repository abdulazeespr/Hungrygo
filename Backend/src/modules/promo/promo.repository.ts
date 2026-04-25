import prisma from '../../config/database.js';
import type { CreatePromoDto } from './promo.types.js';

export const promoRepository = {
  async create(data: CreatePromoDto) {
    return prisma.promoCode.create({
      data: {
        code: data.code,
        description: data.description,
        discountType: data.discountType,
        discountValue: data.discountValue,
        maxUses: data.maxUses,
        minOrderAmount: data.minOrderAmount,
        validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
      },
    });
  },

  async findByCode(code: string) {
    return prisma.promoCode.findUnique({
      where: { code },
    });
  },

  async checkUserUsage(userId: string, promoId: string) {
    const usage = await prisma.promoUsage.findUnique({
      where: {
        userId_promoId: { userId, promoId },
      },
    });
    return !!usage;
  },
};
