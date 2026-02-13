import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';
import { REDIS_CLIENT, REDLOCK_INSTANCE } from './redis.constants';

const mockRedis = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  ttl: jest.fn(),
  ping: jest.fn(),
  eval: jest.fn(),
  pipeline: jest.fn(),
};

const mockRedlock = {
  acquire: jest.fn(),
};

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: REDLOCK_INSTANCE, useValue: mockRedlock },
      ],
    }).compile();
    service = module.get<RedisService>(RedisService);
  });

  describe('When calling set', () => {
    it('Then it should set a key with EX TTL', async () => {
      await service.set('mykey', 'myval', 10);
      expect(mockRedis.set).toHaveBeenCalledWith('mykey', 'myval', 'EX', 10);
    });
  });

  describe('When calling get', () => {
    it('Then it should return the value from Redis', async () => {
      mockRedis.get.mockResolvedValue('hello');
      const result = await service.get('mykey');
      expect(result).toBe('hello');
      expect(mockRedis.get).toHaveBeenCalledWith('mykey');
    });

    it('Then it should return null for missing keys', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.get('missing');
      expect(result).toBeNull();
    });
  });

  describe('When calling del', () => {
    it('Then it should delete the specified keys', async () => {
      mockRedis.del.mockResolvedValue(2);
      const result = await service.del('k1', 'k2');
      expect(result).toBe(2);
      expect(mockRedis.del).toHaveBeenCalledWith('k1', 'k2');
    });

    it('Then it should return 0 when no keys are provided', async () => {
      const result = await service.del();
      expect(result).toBe(0);
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('When calling exists', () => {
    it('Then it should return true when key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);
      const result = await service.exists('mykey');
      expect(result).toBe(true);
    });

    it('Then it should return false when key does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);
      const result = await service.exists('missing');
      expect(result).toBe(false);
    });
  });

  describe('When calling setSeatHold', () => {
    it('Then it should set the hold key with default TTL', async () => {
      await service.setSeatHold('hold:seat-1', 'passenger-1');
      expect(mockRedis.set).toHaveBeenCalledWith('hold:seat-1', 'passenger-1', 'EX', 120);
    });

    it('Then it should accept a custom TTL', async () => {
      await service.setSeatHold('hold:seat-1', 'passenger-1', 60);
      expect(mockRedis.set).toHaveBeenCalledWith('hold:seat-1', 'passenger-1', 'EX', 60);
    });
  });

  describe('When calling releaseSeatHoldIfOwner', () => {
    it('Then it should return true when the owner matches', async () => {
      mockRedis.eval.mockResolvedValue(1);
      const result = await service.releaseSeatHoldIfOwner('hold:seat-1', 'passenger-1');
      expect(result).toBe(true);
    });

    it('Then it should return false when the owner does not match', async () => {
      mockRedis.eval.mockResolvedValue(0);
      const result = await service.releaseSeatHoldIfOwner('hold:seat-1', 'wrong-passenger');
      expect(result).toBe(false);
    });
  });

  describe('When calling setSeatMapCache', () => {
    it('Then it should cache with default TTL of 2 seconds', async () => {
      await service.setSeatMapCache('seatmap:f1', '{"seats":[]}');
      expect(mockRedis.set).toHaveBeenCalledWith('seatmap:f1', '{"seats":[]}', 'EX', 2);
    });
  });

  describe('When calling addRateLimitEntry', () => {
    it('Then it should return the count from the pipeline', async () => {
      const mockPipeline = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        pexpire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0],
          [null, 1],
          [null, 5],
          [null, 1],
        ]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);
      const count = await service.addRateLimitEntry('ratelimit:127.0.0.1', 1000, 2000);
      expect(count).toBe(5);
    });

    it('Then it should return 0 when pipeline returns null', async () => {
      const mockPipeline = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        pexpire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);
      const count = await service.addRateLimitEntry('ratelimit:127.0.0.1', 1000, 2000);
      expect(count).toBe(0);
    });
  });

  describe('When calling acquireLock', () => {
    it('Then it should delegate to Redlock', async () => {
      const mockLock = { release: jest.fn() };
      mockRedlock.acquire.mockResolvedValue(mockLock);
      const lock = await service.acquireLock('lock:seat:s1', 5000);
      expect(lock).toBe(mockLock);
      expect(mockRedlock.acquire).toHaveBeenCalledWith(['lock:seat:s1'], 5000);
    });
  });

  describe('When calling releaseLock', () => {
    it('Then it should call release on the lock', async () => {
      const mockLock = { release: jest.fn().mockResolvedValue(undefined) };
      await service.releaseLock(mockLock as any);
      expect(mockLock.release).toHaveBeenCalled();
    });
  });

  describe('When calling ping', () => {
    it('Then it should return PONG', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      const result = await service.ping();
      expect(result).toBe('PONG');
    });
  });
});
