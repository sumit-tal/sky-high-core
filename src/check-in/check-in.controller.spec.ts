import { Test, TestingModule } from '@nestjs/testing';
import { CheckInController } from './check-in.controller';
import { CheckInService } from './check-in.service';
import { CheckInStatus } from '../common/types/enums';
import { CheckInResponseDto, StartCheckInRequestDto } from './dto';

const PASSENGER_ID = 'passenger-uuid-1';
const FLIGHT_ID = 'flight-uuid-1';
const SEAT_ID = 'seat-uuid-1';

const mockCheckInResponse: CheckInResponseDto = {
  id: 'checkin-uuid-1',
  passengerId: PASSENGER_ID,
  flightId: FLIGHT_ID,
  seatId: SEAT_ID,
  status: CheckInStatus.IN_PROGRESS,
  baggageWeight: null,
  excessFee: null,
  paymentId: null,
  holdExpiresAt: new Date('2026-02-14T15:20:00Z'),
  createdAt: new Date('2026-02-14T15:18:00Z'),
};

describe('CheckInController', () => {
  let controller: CheckInController;
  let checkInService: jest.Mocked<CheckInService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckInController],
      providers: [
        {
          provide: CheckInService,
          useValue: {
            startCheckIn: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CheckInController>(CheckInController);
    checkInService = module.get(CheckInService);
  });

  describe('startCheckIn', () => {
    it('When valid request, Then delegates to service and returns check-in response', async () => {
      const dto: StartCheckInRequestDto = { flightId: FLIGHT_ID, seatId: SEAT_ID };
      checkInService.startCheckIn.mockResolvedValue(mockCheckInResponse);
      const result = await controller.startCheckIn(PASSENGER_ID, dto);
      expect(result).toEqual(mockCheckInResponse);
      expect(checkInService.startCheckIn).toHaveBeenCalledWith({
        passengerId: PASSENGER_ID,
        dto,
      });
    });

    it('When service throws, Then exception propagates to caller', async () => {
      const dto: StartCheckInRequestDto = { flightId: FLIGHT_ID, seatId: SEAT_ID };
      checkInService.startCheckIn.mockRejectedValue(new Error('Service error'));
      await expect(controller.startCheckIn(PASSENGER_ID, dto)).rejects.toThrow('Service error');
    });
  });
});
