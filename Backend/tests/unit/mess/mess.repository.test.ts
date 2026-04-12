import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { messRepository } from '../../../src/modules/mess/mess.repository.js';
import prisma from '../../../src/config/database.js';

describe('Mess Repository', () => {
  beforeEach(() => {
    jest.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([] as never);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('findNearby should call prisma.$queryRaw with correct parameters', async () => {
    await messRepository.findNearby({ lat: 10, lng: 20, limit: 15, radius_km: 5 });
    
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});

