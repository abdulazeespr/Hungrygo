import type { SubscriptionMealSlot, Subscription } from '../../generated/prisma/client.js';

export interface CancelMealSlotDto {
  reason?: string;
}

export interface MealSlotWithSub extends SubscriptionMealSlot {
  subscription: Subscription;
}

export interface MealSlotListQuery {
  from?: string;
  to?: string;
  status?: string;
  cursor?: string;
  limit: number;
}
