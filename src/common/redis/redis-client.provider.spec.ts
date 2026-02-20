import { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import {
  redisClientProvider,
  redisSubscriberProvider,
} from "./redis-client.provider";
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from "./redis.constants";

jest.mock("ioredis", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const MockRedis = jest.mocked(Redis);

const DEFAULT_REDIS_URL = "redis://localhost:6379";
const CUSTOM_REDIS_URL = "redis://custom-host:6380";

type RedisOptions = {
  retryStrategy: (times: number) => number;
  maxRetriesPerRequest: number;
  enableReadyCheck: boolean;
  lazyConnect: boolean;
};
type RedisFactory = { useFactory: (cs: ConfigService) => Redis };

function buildConfigService(redisUrl?: string): ConfigService {
  return {
    get: jest.fn().mockImplementation((key: string, defaultValue: string) => {
      if (key === "REDIS_URL") return redisUrl ?? defaultValue;
      return defaultValue;
    }),
  } as unknown as ConfigService;
}

function getOptions(): RedisOptions {
  const call = MockRedis.mock.calls[0] as unknown as [string, RedisOptions];
  return call[1];
}

describe("redisClientProvider", () => {
  const provider = redisClientProvider as unknown as FactoryProvider &
    RedisFactory;

  beforeEach(() => {
    MockRedis.mockClear();
  });

  describe("When provider metadata is checked", () => {
    it("Then it should use the REDIS_CLIENT injection token", () => {
      expect(provider.provide).toBe(REDIS_CLIENT);
    });

    it("Then it should inject ConfigService", () => {
      expect(provider.inject).toContain(ConfigService);
    });
  });

  describe("When REDIS_URL is configured", () => {
    it("Then it should create a Redis instance with the configured URL", () => {
      provider.useFactory(buildConfigService(CUSTOM_REDIS_URL));
      expect(MockRedis).toHaveBeenCalledWith(
        CUSTOM_REDIS_URL,
        expect.any(Object),
      );
    });
  });

  describe("When REDIS_URL is not configured", () => {
    it("Then it should fall back to the default URL", () => {
      provider.useFactory(buildConfigService(undefined));
      expect(MockRedis).toHaveBeenCalledWith(
        DEFAULT_REDIS_URL,
        expect.any(Object),
      );
    });
  });

  describe("When Redis client is created", () => {
    beforeEach(() => {
      provider.useFactory(buildConfigService(CUSTOM_REDIS_URL));
    });

    it("Then it should configure maxRetriesPerRequest to 3", () => {
      expect(getOptions().maxRetriesPerRequest).toBe(3);
    });

    it("Then it should enable the ready check", () => {
      expect(getOptions().enableReadyCheck).toBe(true);
    });

    it("Then it should disable lazy connect", () => {
      expect(getOptions().lazyConnect).toBe(false);
    });

    it("Then retryStrategy should cap backoff at 2000ms", () => {
      const { retryStrategy } = getOptions();
      expect(retryStrategy(1)).toBe(200);
      expect(retryStrategy(5)).toBe(1000);
      expect(retryStrategy(20)).toBe(2000);
    });
  });
});

describe("redisSubscriberProvider", () => {
  const provider = redisSubscriberProvider as unknown as FactoryProvider &
    RedisFactory;

  beforeEach(() => {
    MockRedis.mockClear();
  });

  describe("When provider metadata is checked", () => {
    it("Then it should use the REDIS_SUBSCRIBER injection token", () => {
      expect(provider.provide).toBe(REDIS_SUBSCRIBER);
    });

    it("Then it should inject ConfigService", () => {
      expect(provider.inject).toContain(ConfigService);
    });
  });

  describe("When REDIS_URL is configured", () => {
    it("Then it should create a separate Redis instance with the configured URL", () => {
      provider.useFactory(buildConfigService(CUSTOM_REDIS_URL));
      expect(MockRedis).toHaveBeenCalledWith(
        CUSTOM_REDIS_URL,
        expect.any(Object),
      );
    });
  });

  describe("When REDIS_URL is not configured", () => {
    it("Then it should fall back to the default URL", () => {
      provider.useFactory(buildConfigService(undefined));
      expect(MockRedis).toHaveBeenCalledWith(
        DEFAULT_REDIS_URL,
        expect.any(Object),
      );
    });
  });

  describe("When Redis subscriber client is created", () => {
    beforeEach(() => {
      provider.useFactory(buildConfigService(CUSTOM_REDIS_URL));
    });

    it("Then it should configure maxRetriesPerRequest to 3", () => {
      expect(getOptions().maxRetriesPerRequest).toBe(3);
    });

    it("Then retryStrategy should cap backoff at 2000ms", () => {
      const { retryStrategy } = getOptions();
      expect(retryStrategy(1)).toBe(200);
      expect(retryStrategy(10)).toBe(2000);
    });
  });

  describe("When both providers are instantiated", () => {
    it("Then they should create independent Redis instances", () => {
      const configService = buildConfigService(CUSTOM_REDIS_URL);
      const clientProvider = redisClientProvider as unknown as RedisFactory;
      const subscriberProvider =
        redisSubscriberProvider as unknown as RedisFactory;
      clientProvider.useFactory(configService);
      subscriberProvider.useFactory(configService);
      expect(MockRedis).toHaveBeenCalledTimes(2);
    });
  });
});
