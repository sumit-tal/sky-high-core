import { HealthCheckError } from '@nestjs/terminus';
import Redis from 'ioredis';
import { RedisHealthIndicator } from './redis-health.indicator';

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator;
  let redisClient: jest.Mocked<Pick<Redis, 'ping'>>;

  beforeEach(() => {
    redisClient = { ping: jest.fn() };
    indicator = new RedisHealthIndicator(redisClient as unknown as Redis);
  });

  describe('When Redis responds with PONG', () => {
    it('Then it should return healthy status', async () => {
      redisClient.ping.mockResolvedValue('PONG');
      const result = await indicator.isHealthy('redis');
      expect(result).toEqual({ redis: { status: 'up' } });
    });
  });

  describe('When Redis responds with unexpected value', () => {
    it('Then it should throw HealthCheckError', async () => {
      redisClient.ping.mockResolvedValue('UNEXPECTED');
      await expect(indicator.isHealthy('redis')).rejects.toThrow(HealthCheckError);
    });
  });

  describe('When Redis connection fails', () => {
    it('Then it should throw HealthCheckError with error message', async () => {
      redisClient.ping.mockRejectedValue(new Error('Connection refused'));
      await expect(indicator.isHealthy('redis')).rejects.toThrow(HealthCheckError);
      try {
        await indicator.isHealthy('redis');
      } catch (error) {
        expect(error).toBeInstanceOf(HealthCheckError);
        expect((error as HealthCheckError).causes).toEqual({
          redis: { status: 'down', message: 'Connection refused' },
        });
      }
    });
  });

  describe('When custom key is provided', () => {
    it('Then it should use the custom key in the result', async () => {
      redisClient.ping.mockResolvedValue('PONG');
      const result = await indicator.isHealthy('custom-redis');
      expect(result).toEqual({ 'custom-redis': { status: 'up' } });
    });
  });
});
