import type { User } from '../../src/generated/prisma/client.js';

const defaultUser: User = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  phone: '9876543210',
  email: null,
  name: null,
  role: 'customer',
  dietaryPref: 'veg',
  isVerified: true,
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

/**
 * Build a mock User object with optional overrides.
 */
export const buildUser = (overrides?: Partial<User>): User => ({
  ...defaultUser,
  ...overrides,
});
