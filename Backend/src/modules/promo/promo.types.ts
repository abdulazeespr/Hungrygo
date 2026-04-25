import type { PromoDiscountType } from '../../generated/prisma/client.js';

export interface CreatePromoDto {
  code: string;
  description?: string;
  discountType: PromoDiscountType;
  discountValue: number;
  maxUses?: number;
  minOrderAmount?: number;
  validFrom?: string;
  validUntil?: string;
}

export interface ValidatePromoDto {
  code: string;
  amount: number;
}
