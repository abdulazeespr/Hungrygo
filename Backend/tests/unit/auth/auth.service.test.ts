import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock dependencies before imports
const mockRedis = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  exists: jest.fn(),
};

const mockAuthRepository = {
  findByPhone: jest.fn(),
  findById: jest.fn(),
  upsertByPhone: jest.fn(),
};

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  default: mockRedis,
}));

jest.unstable_mockModule('../../src/modules/auth/auth.repository.js', () => ({
  authRepository: mockAuthRepository,
}));

jest.unstable_mockModule('../../src/config/index.js', () => ({
  config: {
    OTP_LENGTH: 6,
    OTP_EXPIRES_IN_SECONDS: 300,
    JWT_ACCESS_SECRET: 'test-access-secret-that-is-32-chars!!',
    JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-32-chars!',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '30d',
  },
}));

jest.unstable_mockModule('../../src/config/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { authService } = await import('../../../src/modules/auth/auth.service.ts');
const { buildUser } = await import('../../fixtures/userFactory.ts');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendOtp', () => {
    it('should send OTP successfully when rate limit is not exceeded', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.set.mockResolvedValue('OK');

      const result = await authService.sendOtp('9876543210');

      expect(result.message).toBe('OTP sent successfully');
      expect(result.expires_in).toBe(300);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'otp:9876543210',
        expect.any(String),
        'EX',
        300,
      );
    });

    it('should throw rate limit error when max attempts exceeded', async () => {
      mockRedis.incr.mockResolvedValue(6); // Exceeds max of 5

      await expect(authService.sendOtp('9876543210')).rejects.toThrow(
        'Too many OTP requests. Try again in 1 hour.',
      );
    });
  });

  describe('verifyOtp', () => {
    it('should verify OTP and return tokens', async () => {
      const mockUser = buildUser();
      mockRedis.get.mockResolvedValue('123456');
      mockRedis.del.mockResolvedValue(1);
      mockRedis.set.mockResolvedValue('OK');
      mockAuthRepository.upsertByPhone.mockResolvedValue(mockUser);

      const result = await authService.verifyOtp('9876543210', '123456');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.phone).toBe(mockUser.phone);
    });

    it('should throw error when OTP has expired', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(authService.verifyOtp('9876543210', '123456')).rejects.toThrow(
        'OTP has expired. Please request a new one.',
      );
    });

    it('should throw error when OTP is incorrect', async () => {
      mockRedis.get.mockResolvedValue('654321');

      await expect(authService.verifyOtp('9876543210', '123456')).rejects.toThrow(
        'The OTP entered is incorrect.',
      );
    });
  });

  describe('refreshToken', () => {
    it('should throw error for invalid refresh token', async () => {
      await expect(authService.refreshToken('invalid-token')).rejects.toThrow(
        'Invalid or expired refresh token.',
      );
    });
  });
});
