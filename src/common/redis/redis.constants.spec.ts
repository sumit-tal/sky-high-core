import {
  REDIS_TTL,
  REDIS_KEY_PREFIX,
  RedisKey,
  REDIS_EXPIRED_CHANNEL,
  REDIS_CLIENT,
  REDIS_SUBSCRIBER,
  REDLOCK_INSTANCE,
} from './redis.constants';

describe('RedisConstants', () => {
  describe('When checking REDIS_TTL values', () => {
    it('Then SEAT_LOCK should be 5 seconds', () => {
      expect(REDIS_TTL.SEAT_LOCK).toBe(5);
    });

    it('Then WAITLIST_LOCK should be 5 seconds', () => {
      expect(REDIS_TTL.WAITLIST_LOCK).toBe(5);
    });

    it('Then SEAT_HOLD should be 120 seconds', () => {
      expect(REDIS_TTL.SEAT_HOLD).toBe(120);
    });

    it('Then SEAT_MAP_CACHE should be 2 seconds', () => {
      expect(REDIS_TTL.SEAT_MAP_CACHE).toBe(2);
    });

    it('Then RATE_LIMIT should be 2 seconds', () => {
      expect(REDIS_TTL.RATE_LIMIT).toBe(2);
    });
  });

  describe('When building Redis keys with RedisKey helpers', () => {
    it('Then seatLock should produce lock:seat:{seatId}', () => {
      expect(RedisKey.seatLock('seat-123')).toBe('lock:seat:seat-123');
    });

    it('Then waitlistLock should produce lock:waitlist:{flightId}', () => {
      expect(RedisKey.waitlistLock('flight-456')).toBe('lock:waitlist:flight-456');
    });

    it('Then seatHold should produce hold:{seatId}', () => {
      expect(RedisKey.seatHold('seat-789')).toBe('hold:seat-789');
    });

    it('Then seatMapCache should produce seatmap:{flightId}', () => {
      expect(RedisKey.seatMapCache('flight-001')).toBe('seatmap:flight-001');
    });

    it('Then rateLimit should produce ratelimit:{ip}', () => {
      expect(RedisKey.rateLimit('192.168.1.1')).toBe('ratelimit:192.168.1.1');
    });
  });

  describe('When checking key prefixes', () => {
    it('Then SEAT_LOCK prefix should be lock:seat', () => {
      expect(REDIS_KEY_PREFIX.SEAT_LOCK).toBe('lock:seat');
    });

    it('Then SEAT_HOLD prefix should be hold', () => {
      expect(REDIS_KEY_PREFIX.SEAT_HOLD).toBe('hold');
    });
  });

  describe('When checking injection tokens and channels', () => {
    it('Then REDIS_EXPIRED_CHANNEL should be __keyevent@0__:expired', () => {
      expect(REDIS_EXPIRED_CHANNEL).toBe('__keyevent@0__:expired');
    });

    it('Then injection tokens should be defined', () => {
      expect(REDIS_CLIENT).toBe('REDIS_CLIENT');
      expect(REDIS_SUBSCRIBER).toBe('REDIS_SUBSCRIBER');
      expect(REDLOCK_INSTANCE).toBe('REDLOCK_INSTANCE');
    });
  });
});
