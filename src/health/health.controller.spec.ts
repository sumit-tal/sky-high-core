import { HealthCheckService, TypeOrmHealthIndicator, HealthCheckResult } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis-health.indicator';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: jest.Mocked<HealthCheckService>;
  let dbIndicator: jest.Mocked<TypeOrmHealthIndicator>;
  let redisIndicator: jest.Mocked<RedisHealthIndicator>;

  beforeEach(() => {
    dbIndicator = { pingCheck: jest.fn() } as unknown as jest.Mocked<TypeOrmHealthIndicator>;
    redisIndicator = { isHealthy: jest.fn() } as unknown as jest.Mocked<RedisHealthIndicator>;
    healthCheckService = {
      check: jest.fn(),
    } as unknown as jest.Mocked<HealthCheckService>;
    controller = new HealthController(healthCheckService, dbIndicator, redisIndicator);
  });

  describe('When all dependencies are healthy', () => {
    it('Then it should return status ok with component details', async () => {
      const expectedResult: HealthCheckResult = {
        status: 'ok',
        info: { postgres: { status: 'up' }, redis: { status: 'up' } },
        error: {},
        details: { postgres: { status: 'up' }, redis: { status: 'up' } },
      };
      healthCheckService.check.mockResolvedValue(expectedResult);
      const result = await controller.check();
      expect(result).toEqual(expectedResult);
      expect(result.status).toBe('ok');
    });
  });

  describe('When PostgreSQL is down', () => {
    it('Then it should return status error with postgres details', async () => {
      const expectedResult: HealthCheckResult = {
        status: 'error',
        info: { redis: { status: 'up' } },
        error: { postgres: { status: 'down' } },
        details: { postgres: { status: 'down' }, redis: { status: 'up' } },
      };
      healthCheckService.check.mockResolvedValue(expectedResult);
      const result = await controller.check();
      expect(result.status).toBe('error');
      expect(result.error).toHaveProperty('postgres');
    });
  });

  describe('When Redis is down', () => {
    it('Then it should return status error with redis details', async () => {
      const expectedResult: HealthCheckResult = {
        status: 'error',
        info: { postgres: { status: 'up' } },
        error: { redis: { status: 'down' } },
        details: { postgres: { status: 'up' }, redis: { status: 'down' } },
      };
      healthCheckService.check.mockResolvedValue(expectedResult);
      const result = await controller.check();
      expect(result.status).toBe('error');
      expect(result.error).toHaveProperty('redis');
    });
  });

  describe('When health check is called', () => {
    it('Then it should invoke check with two indicator functions', async () => {
      const expectedResult: HealthCheckResult = {
        status: 'ok',
        info: {},
        error: {},
        details: {},
      };
      healthCheckService.check.mockResolvedValue(expectedResult);
      await controller.check();
      expect(healthCheckService.check).toHaveBeenCalledTimes(1);
      const indicators = healthCheckService.check.mock.calls[0][0];
      expect(indicators).toHaveLength(2);
      expect(typeof indicators[0]).toBe('function');
      expect(typeof indicators[1]).toBe('function');
    });
  });
});
