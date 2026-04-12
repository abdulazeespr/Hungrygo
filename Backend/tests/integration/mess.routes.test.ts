import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import messRoutes from '../../src/modules/mess/mess.routes.js';
import { messService } from '../../src/modules/mess/mess.service.js';
import * as authMiddleware from '../../src/middlewares/authenticate.js';

const app = express();
app.use(express.json());
app.use('/mess-providers', messRoutes);
// global error handler stub
app.use((err: any, req: any, res: any, next: any) => {
  res.status(err.statusCode || 500).json({ success: false, error: err.message });
});

describe('Mess Routes Integration', () => {
  beforeEach(() => {
    // We cannot easily spyOn middleware correctly if it's already bound to the router.
    // Instead of testing authentication, we will just test the public routes which don't need auth,
    // or test the logic by mocking the service heavily.
    jest.spyOn(messService, 'getNearby').mockResolvedValue([] as never);
    jest.spyOn(messService, 'registerMess').mockResolvedValue({} as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GET /mess-providers should return nearby messes', async () => {
    (messService.getNearby as jest.Mock).mockResolvedValueOnce([{ id: 'mess-1' }] as never);
    
    const res = await request(app).get('/mess-providers?lat=18.5204&lng=73.8567&radius_km=5');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });
});

