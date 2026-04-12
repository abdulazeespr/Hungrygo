import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

jest.unstable_mockModule('../../src/config/database.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../src/config/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { authRepository } = await import('../../../src/modules/auth/auth.repository.ts');
const { buildUser } = await import('../../fixtures/userFactory.ts');

describe('AuthRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findByPhone', () => {
    it('should return user when found', async () => {
      const mockUser = buildUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await authRepository.findByPhone('9876543210');

      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { phone: '9876543210' },
      });
    });

    it('should return null when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await authRepository.findByPhone('0000000000');

      expect(result).toBeNull();
    });
  });

  describe('upsertByPhone', () => {
    it('should create user if not exists', async () => {
      const mockUser = buildUser({ phone: '9999999999' });
      mockPrisma.user.upsert.mockResolvedValue(mockUser);

      const result = await authRepository.upsertByPhone('9999999999');

      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
        where: { phone: '9999999999' },
        update: { updatedAt: expect.any(Date) },
        create: { phone: '9999999999', isVerified: true },
      });
    });

    it('should update existing user (idempotency)', async () => {
      const mockUser = buildUser();
      mockPrisma.user.upsert.mockResolvedValue(mockUser);

      const result1 = await authRepository.upsertByPhone('9876543210');
      const result2 = await authRepository.upsertByPhone('9876543210');

      expect(result1).toEqual(result2);
      expect(mockPrisma.user.upsert).toHaveBeenCalledTimes(2);
    });
  });
});
