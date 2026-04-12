import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { messService } from '../../../src/modules/mess/mess.service.js';
import { messRepository } from '../../../src/modules/mess/mess.repository.js';
import redis from '../../../src/config/redis.js';
import { HttpError } from '../../../src/shared/errors/HttpError.js';
import { ErrorCodes } from '../../../src/shared/errors/errorCodes.js';

describe('Mess Service', () => {
  const mockOwnerId = 'owner-123';
  const mockMessId = 'mess-123';
  
  beforeEach(() => {
    jest.spyOn(messRepository, 'findNearby').mockResolvedValue([] as never);
    jest.spyOn(messRepository, 'findById').mockResolvedValue(null as never);
    jest.spyOn(messRepository, 'create').mockResolvedValue({} as never);
    jest.spyOn(messRepository, 'update').mockResolvedValue({} as never);
    
    jest.spyOn(redis, 'get').mockResolvedValue(null as never);
    jest.spyOn(redis, 'set').mockResolvedValue('OK' as never);
    jest.spyOn(redis, 'del').mockResolvedValue(1 as never);
    jest.spyOn(redis, 'scanStream').mockReturnValue({ on: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getNearby', () => {
    const params = { lat: 10, lng: 20 };
    const cacheKey = `hungrygo:mess:nearby:${JSON.stringify(params)}`;

    it('should return cached data if available', async () => {
      const mockCachedData = [{ id: 'mess-1' }];
      (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockCachedData) as never);

      const result = await messService.getNearby(params);
      
      expect(redis.get).toHaveBeenCalledWith(cacheKey);
      expect(messRepository.findNearby).not.toHaveBeenCalled();
      expect(result).toEqual(mockCachedData);
    });

    it('should fetch from DB and cache if not in redis', async () => {
      const mockDbData = [{ id: 'mess-1' }];
      (redis.get as jest.Mock).mockResolvedValueOnce(null as never);
      (messRepository.findNearby as jest.Mock).mockResolvedValueOnce(mockDbData as never);

      const result = await messService.getNearby(params);

      expect(redis.get).toHaveBeenCalledWith(cacheKey);
      expect(messRepository.findNearby).toHaveBeenCalledWith(params);
      expect((redis.set as jest.Mock).mock.calls[0]).toEqual([cacheKey, JSON.stringify(mockDbData), 'EX', 300]);
      expect(result).toEqual(mockDbData);
    });
  });

  describe('updateMess', () => {
    it('should throw MESS_OWNER_MISMATCH when trying to update someone elses mess', async () => {
      (messRepository.findById as jest.Mock).mockResolvedValueOnce({
        id: mockMessId,
        ownerId: 'different-owner-id',
      } as never);

      await expect(messService.updateMess(mockMessId, mockOwnerId, {}))
        .rejects.toThrow(HttpError);
      
      await expect(messService.updateMess(mockMessId, mockOwnerId, {}))
        .rejects.toMatchObject({ code: ErrorCodes.MESS_OWNER_MISMATCH });
        
      expect(messRepository.update).not.toHaveBeenCalled();
    });

    it('should update mess if ownership is verified', async () => {
      (messRepository.findById as jest.Mock).mockResolvedValueOnce({
        id: mockMessId,
        ownerId: mockOwnerId,
      } as never);
      
      const updateData = { name: 'New Name' };
      (messRepository.update as jest.Mock).mockResolvedValueOnce(updateData as never);
      
      const streamObj = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
             // Let it just register
          }
        }),
      };
      (redis.scanStream as jest.Mock).mockReturnValue(streamObj as never);

      const result = await messService.updateMess(mockMessId, mockOwnerId, updateData);

      expect(result).toEqual(updateData);
      expect(messRepository.update).toHaveBeenCalledWith(mockMessId, updateData);
      expect(redis.del).toHaveBeenCalledWith(`hungrygo:mess:${mockMessId}`);
    });
  });
});

