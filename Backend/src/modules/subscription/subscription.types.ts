import type { MealSlot, DurationType } from '../../generated/prisma/client.js';

export interface CreateSubscriptionDto {
  messId: string;
  planId: string;
  mealSlot: MealSlot;
  durationType: DurationType;
  startDate: string; // YYYY-MM-DD
  autoRenew: boolean;
}

export interface PauseSubscriptionDto {
  pauseStart: string; // YYYY-MM-DD
  pauseEnd: string;   // YYYY-MM-DD
}

export interface CancelSubscriptionDto {
  reason?: string;
}

export interface MealSlotDateEntry {
  date: Date;
  slot: MealSlot;
}

export interface SubscriptionListQuery {
  status?: string;
  cursor?: string;
  limit: number;
}

export interface SubscriptionDetailQuery {
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
}
