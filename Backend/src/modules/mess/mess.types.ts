import type { MessProvider, PricingPlan } from '../../generated/prisma/client.js';

export interface MessWithDistance extends MessProvider {
  distance_km: string;
  cheapest_plan: {
    mealSlot: string;
    durationType: string;
    price: string;
  } | null;
}

export interface CreateMessDto {
  name: string;
  description?: string;
  fssaiNumber?: string;
  phone?: string;
  address: string;
  city: string;
  pincode?: string;
  lat: number;
  lng: number;
  dietaryType?: 'veg' | 'non_veg' | 'both';
  opensAt?: string;
  closesAt?: string;
}

export interface UpdateMessDto extends Partial<CreateMessDto> {}

export interface GetNearbyQuery {
  lat: number;
  lng: number;
  radius_km?: number;
  dietary_type?: string;
  sort?: string;
  limit?: number;
  cursor?: string;
}

export interface UpsertPlanDto {
  mealSlot: 'breakfast' | 'lunch' | 'dinner' | 'full_day';
  durationType: 'daily' | 'weekly' | 'monthly';
  price: number;
}
