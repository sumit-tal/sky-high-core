import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisKeyExpirySubscriber, SEAT_HOLD_EXPIRED_EVENT } from './redis-key-expiry.subscriber';
import { REDIS_EXPIRED_CHANNEL, REDIS_SUBSCRIBER } from './redis.constants';

const mockSubscriber = {
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  on: jest.fn(),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

describe('RedisKeyExpirySubscriber', () => {
  let subscriber: RedisKeyExpirySubscriber;
  let messageHandler: (channel: string, key: string) => void;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisKeyExpirySubscriber,
        { provide: REDIS_SUBSCRIBER, useValue: mockSubscriber },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();
    subscriber = module.get<RedisKeyExpirySubscriber>(RedisKeyExpirySubscriber);
  });

  describe('When onModuleInit is called', () => {
    it('Then it should subscribe to the expired channel', async () => {
      await subscriber.onModuleInit();
      expect(mockSubscriber.subscribe).toHaveBeenCalledWith(REDIS_EXPIRED_CHANNEL);
      expect(mockSubscriber.on).toHaveBeenCalledWith('message', expect.any(Function));
      messageHandler = mockSubscriber.on.mock.calls[0][1];
    });
  });

  describe('When onModuleDestroy is called', () => {
    it('Then it should unsubscribe from the expired channel', async () => {
      await subscriber.onModuleDestroy();
      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith(REDIS_EXPIRED_CHANNEL);
    });
  });

  describe('When a hold key expires', () => {
    beforeEach(async () => {
      await subscriber.onModuleInit();
      messageHandler = mockSubscriber.on.mock.calls[0][1];
    });

    it('Then it should emit a SEAT_HOLD_EXPIRED_EVENT with the seatId', () => {
      messageHandler(REDIS_EXPIRED_CHANNEL, 'hold:seat-abc-123');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        SEAT_HOLD_EXPIRED_EVENT,
        { seatId: 'seat-abc-123', key: 'hold:seat-abc-123' },
      );
    });

    it('Then it should ignore non-hold keys', () => {
      messageHandler(REDIS_EXPIRED_CHANNEL, 'seatmap:flight-1');
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('Then it should ignore messages from other channels', () => {
      messageHandler('__keyevent@0__:set', 'hold:seat-abc-123');
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
