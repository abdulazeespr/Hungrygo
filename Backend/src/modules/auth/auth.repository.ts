import prisma from '../../config/database.js';
import type { User } from '../../generated/prisma/client.js';

export const authRepository = {
  async findByPhone(phone: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { phone } });
  },

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  async upsertByPhone(phone: string): Promise<User> {
    return prisma.user.upsert({
      where:  { phone },
      update: { updatedAt: new Date() },
      create: { phone, isVerified: true },
    });
  },
};
