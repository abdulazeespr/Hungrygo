import { promoRepository } from './promo.repository.js';
import { HttpError } from '../../shared/errors/HttpError.js';
import type { CreatePromoDto, ValidatePromoDto } from './promo.types.js';

export const promoService = {
  async createPromo(dto: CreatePromoDto) {
    const existing = await promoRepository.findByCode(dto.code);
    if (existing) {
      throw new HttpError(409, 'CONFLICT', 'Promo code already exists.');
    }
    return promoRepository.create(dto);
  },

  async validatePromo(userId: string, dto: ValidatePromoDto) {
    const promo = await promoRepository.findByCode(dto.code);
    if (!promo || !promo.isActive) {
      throw new HttpError(404, 'NOT_FOUND', 'Promo code is invalid or expired.');
    }

    const now = new Date();
    if (promo.validUntil && now > promo.validUntil) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Promo code has expired.');
    }
    if (now < promo.validFrom) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Promo code is not active yet.');
    }

    if (promo.maxUses && promo.usedCount >= promo.maxUses) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Promo code usage limit reached.');
    }

    if (Number(promo.minOrderAmount) > dto.amount) {
      throw new HttpError(400, 'VALIDATION_ERROR', `Minimum order amount is ${promo.minOrderAmount}`);
    }

    const used = await promoRepository.checkUserUsage(userId, promo.id);
    if (used) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'You have already used this promo code.');
    }

    let discountAmount = 0;
    if (promo.discountType === 'flat') {
      discountAmount = Number(promo.discountValue);
    } else {
      discountAmount = dto.amount * (Number(promo.discountValue) / 100);
    }

    discountAmount = Math.min(discountAmount, dto.amount);

    return {
      promoId: promo.id,
      discountAmount,
      finalAmount: Math.max(0, dto.amount - discountAmount),
    };
  },
};
