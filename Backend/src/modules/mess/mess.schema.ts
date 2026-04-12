import { z } from 'zod/v4';

export const createMessSchema = {
  body: z.object({
    name:         z.string().min(3).max(150),
    description:  z.string().max(500).optional(),
    fssaiNumber:  z.string().length(14).optional(),
    phone:        z.string().regex(/^[6-9]\d{9}$/).optional(),
    address:      z.string().min(10),
    city:         z.string().min(2).max(100),
    pincode:      z.string().length(6),
    lat:          z.number().min(-90).max(90),
    lng:          z.number().min(-180).max(180),
    dietaryType:  z.enum(['veg','non_veg','both']).default('veg'),
    opensAt:      z.string().regex(/^\d{2}:\d{2}$/).optional(),
    closesAt:     z.string().regex(/^\d{2}:\d{2}$/).optional(),
  }),
};

export const updateMessSchema = {
  body: z.object({
    name:         z.string().min(3).max(150).optional(),
    description:  z.string().max(500).optional(),
    fssaiNumber:  z.string().length(14).optional(),
    phone:        z.string().regex(/^[6-9]\d{9}$/).optional(),
    address:      z.string().min(10).optional(),
    city:         z.string().min(2).max(100).optional(),
    pincode:      z.string().length(6).optional(),
    lat:          z.number().min(-90).max(90).optional(),
    lng:          z.number().min(-180).max(180).optional(),
    dietaryType:  z.enum(['veg','non_veg','both']).optional(),
    opensAt:      z.string().regex(/^\d{2}:\d{2}$/).optional(),
    closesAt:     z.string().regex(/^\d{2}:\d{2}$/).optional(),
  }),
};

export const getNearbySchema = {
  query: z.object({
    lat:          z.coerce.number().min(-90).max(90),
    lng:          z.coerce.number().min(-180).max(180),
    radius_km:    z.coerce.number().min(0.5).max(50).default(5),
    dietary_type: z.enum(['veg', 'non_veg', 'both', 'all']).default('all'),
    sort:         z.enum(['distance', 'rating', 'price']).default('distance'),
    limit:        z.coerce.number().min(1).max(50).default(20),
    cursor:       z.string().optional(),
  }),
};

export const upsertPlanSchema = {
  body: z.object({
    mealSlot:     z.enum(['breakfast', 'lunch', 'dinner', 'full_day']),
    durationType: z.enum(['daily', 'weekly', 'monthly']),
    price:        z.number().positive(),
  }),
};

export const messParamsSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};
