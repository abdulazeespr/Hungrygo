import prisma from '../../config/database.js';
import type { User, Address } from '../../generated/prisma/client.js';
import type { UpdateUserDto, CreateAddressDto, UpdateAddressDto } from './user.types.js';

export const userRepository = {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  async update(id: string, data: UpdateUserDto): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  },

  async createAddress(userId: string, data: CreateAddressDto): Promise<Address> {
    if (data.isDefault) {
      return prisma.$transaction(async (tx) => {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
        return tx.address.create({
          data: { ...data, userId },
        });
      });
    }

    return prisma.address.create({
      data: { ...data, userId },
    });
  },

  async findAddresses(userId: string): Promise<Address[]> {
    return prisma.address.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' },
    });
  },

  async findAddressById(id: string, userId: string): Promise<Address | null> {
    return prisma.address.findFirst({
      where: { id, userId },
    });
  },

  async updateAddress(id: string, userId: string, data: UpdateAddressDto): Promise<Address> {
    if (data.isDefault) {
      return prisma.$transaction(async (tx) => {
        await tx.address.updateMany({
          where: { userId, id: { not: id }, isDefault: true },
          data: { isDefault: false },
        });
        return tx.address.update({
          where: { id },
          data,
        });
      });
    }

    return prisma.address.update({
      where: { id },
      data,
    });
  },

  async deleteAddress(id: string, userId: string): Promise<Address> {
    return prisma.address.delete({
      where: { id, userId }, // Ensure user owns the address conceptually
      // Prisma requires the actual unique field for `where` if it's not a compound unique, 
      // but if we query by simple ID it's fine. Wait, in Prisma `delete` must use a unique identifier. 
      // As `id` is primary key, it is unique. I will adjust carefully.
    });
  },
};
