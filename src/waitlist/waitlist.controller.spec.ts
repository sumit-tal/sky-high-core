import { Test, TestingModule } from '@nestjs/testing';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';
import { WaitlistStatus } from '../common/types/enums';
import { WaitlistResponseDto } from './dto';

const PASSENGER_ID = 'passenger-uuid-1';
const FLIGHT_ID = 'flight-uuid-1';
const WAITLIST_ID = 'waitlist-uuid-1';

const mockWaitlistResponse: WaitlistResponseDto = {
  id: WAITLIST_ID,
  flightId: FLIGHT_ID,
  passengerId: PASSENGER_ID,
  position: 1,
  status: WaitlistStatus.WAITING,
  createdAt: new Date('2026-02-14T15:25:00Z'),
};

const mockCancelledResponse: WaitlistResponseDto = {
  ...mockWaitlistResponse,
  status: WaitlistStatus.CANCELLED,
};

describe('WaitlistController', () => {
  let controller: WaitlistController;
  let waitlistService: jest.Mocked<WaitlistService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WaitlistController],
      providers: [
        {
          provide: WaitlistService,
          useValue: {
            joinWaitlist: jest.fn(),
            leaveWaitlist: jest.fn(),
            getFlightWaitlist: jest.fn(),
          },
        },
      ],
    }).compile();
    controller = module.get<WaitlistController>(WaitlistController);
    waitlistService = module.get(WaitlistService);
  });

  describe('joinWaitlist', () => {
    it('When valid request, Then delegates to service and returns waitlist entry', async () => {
      waitlistService.joinWaitlist.mockResolvedValue(mockWaitlistResponse);
      const result = await controller.joinWaitlist(PASSENGER_ID, FLIGHT_ID);
      expect(result).toEqual(mockWaitlistResponse);
      expect(waitlistService.joinWaitlist).toHaveBeenCalledWith({
        passengerId: PASSENGER_ID,
        flightId: FLIGHT_ID,
      });
    });

    it('When service throws, Then exception propagates to caller', async () => {
      waitlistService.joinWaitlist.mockRejectedValue(new Error('Already on waitlist'));
      await expect(
        controller.joinWaitlist(PASSENGER_ID, FLIGHT_ID),
      ).rejects.toThrow('Already on waitlist');
    });
  });

  describe('getFlightWaitlist', () => {
    it('When valid flight ID, Then returns waitlist entries', async () => {
      waitlistService.getFlightWaitlist.mockResolvedValue([mockWaitlistResponse]);
      const result = await controller.getFlightWaitlist(FLIGHT_ID);
      expect(result).toEqual([mockWaitlistResponse]);
      expect(waitlistService.getFlightWaitlist).toHaveBeenCalledWith({
        flightId: FLIGHT_ID,
      });
    });

    it('When no entries, Then returns empty array', async () => {
      waitlistService.getFlightWaitlist.mockResolvedValue([]);
      const result = await controller.getFlightWaitlist(FLIGHT_ID);
      expect(result).toEqual([]);
    });

    it('When service throws, Then exception propagates to caller', async () => {
      waitlistService.getFlightWaitlist.mockRejectedValue(new Error('Flight not found'));
      await expect(
        controller.getFlightWaitlist(FLIGHT_ID),
      ).rejects.toThrow('Flight not found');
    });
  });

  describe('leaveWaitlist', () => {
    it('When valid request, Then delegates to service and returns cancelled entry', async () => {
      waitlistService.leaveWaitlist.mockResolvedValue(mockCancelledResponse);
      const result = await controller.leaveWaitlist(PASSENGER_ID, WAITLIST_ID);
      expect(result).toEqual(mockCancelledResponse);
      expect(waitlistService.leaveWaitlist).toHaveBeenCalledWith({
        waitlistId: WAITLIST_ID,
        passengerId: PASSENGER_ID,
      });
    });

    it('When service throws, Then exception propagates to caller', async () => {
      waitlistService.leaveWaitlist.mockRejectedValue(new Error('Not found'));
      await expect(
        controller.leaveWaitlist(PASSENGER_ID, WAITLIST_ID),
      ).rejects.toThrow('Not found');
    });
  });
});
