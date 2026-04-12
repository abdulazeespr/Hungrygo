import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import menuRoutes from '../../src/modules/menu/menu.routes.js';
import { menuService } from '../../src/modules/menu/menu.service.js';

const app = express();
app.use(express.json());
app.use('/mess-providers/:id/menus', menuRoutes);

describe('Menu Routes Integration', () => {
  beforeEach(() => {
    jest.spyOn(menuService, 'getToday').mockResolvedValue([] as never);
    jest.spyOn(menuService, 'upsert').mockResolvedValue({} as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GET /mess-providers/:id/menus/today should return today menus', async () => {
    (menuService.getToday as jest.Mock).mockResolvedValueOnce([{ mealSlot: 'lunch', items: [] }] as never);
    
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    const res = await request(app).get(`/mess-providers/${validUuid}/menus/today`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0].mealSlot).toBe('lunch');
  });
});

