import { adminRepository } from './admin.repository.js';
import type { ListUsersQuery, ListMessesQuery } from './admin.types.js';

export const adminService = {
  async listUsers(opts: ListUsersQuery) {
    return adminRepository.listUsers(opts);
  },

  async listMesses(opts: ListMessesQuery) {
    return adminRepository.listMesses(opts);
  },

  async updateMessStatus(id: string, status: any) {
    return adminRepository.updateMessStatus(id, status);
  },

  async getPlatformMetrics() {
    return adminRepository.getPlatformMetrics();
  },
};
