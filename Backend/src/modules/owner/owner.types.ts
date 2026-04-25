import type { MessStatus, SubStatus } from '../../generated/prisma/client.js';

export interface OwnerBaseQuery {
  messId: string;
}

export interface SubscriberListQuery extends OwnerBaseQuery {
  status?: SubStatus | 'all';
  cursor?: string;
  limit: number;
}

export interface HeadcountQuery extends OwnerBaseQuery {
  date: string; // YYYY-MM-DD
}

export interface EarningsQuery extends OwnerBaseQuery {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}
