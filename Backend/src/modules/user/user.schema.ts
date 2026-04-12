import { z } from 'zod/v4';

export const updateUserSchema = {
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    email: z.string().email().optional(),
    dietaryPref: z.enum(['veg', 'non_veg', 'egg']).optional(),
  }),
};

export const createAddressSchema = {
  body: z.object({
    label: z.string().max(50).optional(),
    fullAddress: z.string().min(5),
    city: z.string().max(100),
    state: z.string().max(100),
    pincode: z.string().length(6, "Pincode must be exactly 6 characters"),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    isDefault: z.boolean().optional(),
  }),
};

export const updateAddressSchema = {
  body: z.object({
    label: z.string().max(50).optional(),
    fullAddress: z.string().min(5).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    pincode: z.string().length(6, "Pincode must be exactly 6 characters").optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    isDefault: z.boolean().optional(),
  }),
};

export const addressParamsSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};
