import { z } from 'zod/v4';

const menuItemSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(255).optional().default(''),
  isSpecial: z.boolean().optional().default(false),
});

export const upsertMenuSchema = {
  body: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    mealSlot: z.enum(['breakfast', 'lunch', 'dinner']),
    items: z.array(menuItemSchema),
    isHoliday: z.boolean().optional().default(false),
    photoUrl: z.string().url().nullable().optional(),
  }),
};

export const getMenuRangeSchema = {
  query: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  }),
};

export const menuParamsSchema = {
  params: z.object({
    id: z.string().uuid(),
    menuId: z.string().uuid().optional(),
  }),
};
