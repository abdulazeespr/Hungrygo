import { userRepository } from './user.repository.js';
import type { UpdateUserDto, CreateAddressDto, UpdateAddressDto } from './user.types.js';
import { HttpError } from '../../shared/errors/HttpError.js';
import { ErrorCodes } from '../../shared/errors/errorCodes.js';

export const userService = {
  async getMe(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new HttpError(404, ErrorCodes.NOT_FOUND, 'User not found');
    return user;
  },

  async updateMe(userId: string, data: UpdateUserDto) {
    return userRepository.update(userId, data);
  },

  async createAddress(userId: string, data: CreateAddressDto) {
    return userRepository.createAddress(userId, data);
  },

  async getAddresses(userId: string) {
    return userRepository.findAddresses(userId);
  },

  async updateAddress(addressId: string, userId: string, data: UpdateAddressDto) {
    const address = await userRepository.findAddressById(addressId, userId);
    if (!address) {
      throw new HttpError(404, ErrorCodes.NOT_FOUND, 'Address not found');
    }
    return userRepository.updateAddress(addressId, userId, data);
  },

  async deleteAddress(addressId: string, userId: string) {
    const address = await userRepository.findAddressById(addressId, userId);
    if (!address) {
      throw new HttpError(404, ErrorCodes.NOT_FOUND, 'Address not found');
    }
    // Delete specifically by id, after confirming ownership
    return userRepository.deleteAddress(addressId, userId);
  },
};
