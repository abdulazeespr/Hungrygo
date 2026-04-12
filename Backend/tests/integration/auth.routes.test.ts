import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import supertest from 'supertest';

// Mock Redis
const mockRedis = {
  set: jest.fn().mockResolvedValue('OK' as never),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(1 as never),
  incr: jest.fn().mockResolvedValue(1 as never),
  expire: jest.fn().mockResolvedValue(1 as never),
  exists: jest.fn().mockResolvedValue(1 as never),
  on: jest.fn(),
  disconnect: jest.fn(),
  status: 'ready',
};

jest.unstable_mockModule('../src/config/redis.js', () => ({
  default: mockRedis,
}));

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  $disconnect: jest.fn(),
  $on: jest.fn(),
};

jest.unstable_mockModule('../src/config/database.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: app } = await import('../../src/app.ts');
const { buildUser } = await import('../fixtures/userFactory.ts');

const request = supertest(app);

describe('Auth Routes (Integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.incr.mockResolvedValue(1 as never);
    mockRedis.expire.mockResolvedValue(1 as never);
    mockRedis.set.mockResolvedValue('OK' as never);
  });

  describe('POST /api/v1/auth/send-otp', () => {
    it('should send OTP for a valid phone number', async () => {
      const res = await request
        .post('/api/v1/auth/send-otp')
        .send({ phone: '9876543210' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('OTP sent successfully');
      expect(res.body.data.expires_in).toBe(300);
    });

    it('should return 400 for invalid phone number', async () => {
      const res = await request
        .post('/api/v1/auth/send-otp')
        .send({ phone: '1234' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/verify-otp', () => {
    it('should verify OTP and return tokens', async () => {
      const mockUser = buildUser();
      mockRedis.get.mockResolvedValue('123456' as never);
      mockPrisma.user.upsert.mockResolvedValue(mockUser as never);

      const res = await request
        .post('/api/v1/auth/verify-otp')
        .send({ phone: '9876543210', otp: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.access_token).toBeDefined();
      expect(res.body.data.user.phone).toBe('9876543210');
      // Check HttpOnly cookie is set
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should return 400 for expired OTP', async () => {
      mockRedis.get.mockResolvedValue(null as never);

      const res = await request
        .post('/api/v1/auth/verify-otp')
        .send({ phone: '9876543210', otp: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('AUTH_OTP_EXPIRED');
    });

    it('should return 400 for incorrect OTP', async () => {
      mockRedis.get.mockResolvedValue('654321' as never);

      const res = await request
        .post('/api/v1/auth/verify-otp')
        .send({ phone: '9876543210', otp: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('AUTH_INVALID_OTP');
    });
  });

  describe('POST /api/v1/auth/refresh-token', () => {
    it('should return 401 when no refresh token cookie', async () => {
      const res = await request
        .post('/api/v1/auth/refresh-token');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_MISSING_TOKEN');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should return 401 when no access token', async () => {
      const res = await request
        .post('/api/v1/auth/logout');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_MISSING_TOKEN');
    });
  });

  describe('GET /api/v1/health', () => {
    it('should return 200 with status ok', async () => {
      const res = await request.get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
    });
  });
});
