import { Test, TestingModule } from "@nestjs/testing";
import { CheckInController } from "./check-in.controller";
import { CheckInService } from "./check-in.service";
import { CheckInStatus } from "../common/types/enums";
import {
  CheckInResponseDto,
  CheckInCancelledResponseDto,
  StartCheckInRequestDto,
  UpdateCheckInRequestDto,
  CheckInAction,
} from "./dto";

const PASSENGER_ID = "passenger-uuid-1";
const FLIGHT_ID = "flight-uuid-1";
const SEAT_ID = "seat-uuid-1";
const CHECKIN_ID = "checkin-uuid-1";

const mockCheckInResponse: CheckInResponseDto = {
  id: CHECKIN_ID,
  passengerId: PASSENGER_ID,
  flightId: FLIGHT_ID,
  seatId: SEAT_ID,
  status: CheckInStatus.IN_PROGRESS,
  baggageWeight: null,
  excessFee: null,
  paymentId: null,
  holdExpiresAt: new Date("2026-02-14T15:20:00Z"),
  confirmedAt: null,
  message: null,
  createdAt: new Date("2026-02-14T15:18:00Z"),
};

const mockCompletedResponse: CheckInResponseDto = {
  ...mockCheckInResponse,
  status: CheckInStatus.COMPLETED,
  baggageWeight: "20",
  holdExpiresAt: null,
  confirmedAt: new Date("2026-02-14T15:19:30Z"),
};

const mockCancelledResponse: CheckInCancelledResponseDto = {
  id: CHECKIN_ID,
  status: "CANCELLED",
  cancelledAt: new Date("2026-02-14T16:00:00Z"),
};

describe("CheckInController", () => {
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
            getCheckIn: jest.fn(),
            confirmCheckIn: jest.fn(),
            cancelCheckIn: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CheckInController>(CheckInController);
    checkInService = module.get(CheckInService);
  });

  describe("startCheckIn", () => {
    it("When valid request, Then delegates to service and returns check-in response", async () => {
      const dto: StartCheckInRequestDto = {
        flightId: FLIGHT_ID,
        seatId: SEAT_ID,
      };
      checkInService.startCheckIn.mockResolvedValue(mockCheckInResponse);
      const result = await controller.startCheckIn(PASSENGER_ID, dto);
      expect(result).toEqual(mockCheckInResponse);
      expect(checkInService.startCheckIn).toHaveBeenCalledWith({
        passengerId: PASSENGER_ID,
        dto,
      });
    });

    it("When service throws, Then exception propagates to caller", async () => {
      const dto: StartCheckInRequestDto = {
        flightId: FLIGHT_ID,
        seatId: SEAT_ID,
      };
      checkInService.startCheckIn.mockRejectedValue(new Error("Service error"));
      await expect(controller.startCheckIn(PASSENGER_ID, dto)).rejects.toThrow(
        "Service error",
      );
    });
  });

  describe("getCheckIn", () => {
    it("When valid check-in ID, Then returns check-in details", async () => {
      checkInService.getCheckIn.mockResolvedValue(mockCheckInResponse);
      const result = await controller.getCheckIn(PASSENGER_ID, CHECKIN_ID);
      expect(result).toEqual(mockCheckInResponse);
      expect(checkInService.getCheckIn).toHaveBeenCalledWith({
        checkInId: CHECKIN_ID,
        passengerId: PASSENGER_ID,
      });
    });

    it("When service throws, Then exception propagates to caller", async () => {
      checkInService.getCheckIn.mockRejectedValue(new Error("Not found"));
      await expect(
        controller.getCheckIn(PASSENGER_ID, CHECKIN_ID),
      ).rejects.toThrow("Not found");
    });
  });

  describe("confirmCheckIn", () => {
    it("When valid confirm request, Then delegates to service and returns completed response", async () => {
      const dto: UpdateCheckInRequestDto = {
        action: CheckInAction.CONFIRM,
        baggageWeight: 20,
      };
      checkInService.confirmCheckIn.mockResolvedValue(mockCompletedResponse);
      const result = await controller.confirmCheckIn(
        PASSENGER_ID,
        CHECKIN_ID,
        dto,
      );
      expect(result).toEqual(mockCompletedResponse);
      expect(checkInService.confirmCheckIn).toHaveBeenCalledWith({
        checkInId: CHECKIN_ID,
        passengerId: PASSENGER_ID,
        dto,
      });
    });

    it("When service throws, Then exception propagates to caller", async () => {
      const dto: UpdateCheckInRequestDto = { action: CheckInAction.CONFIRM };
      checkInService.confirmCheckIn.mockRejectedValue(
        new Error("Hold expired"),
      );
      await expect(
        controller.confirmCheckIn(PASSENGER_ID, CHECKIN_ID, dto),
      ).rejects.toThrow("Hold expired");
    });
  });

  describe("cancelCheckIn", () => {
    it("When valid cancel request, Then delegates to service and returns cancelled response", async () => {
      checkInService.cancelCheckIn.mockResolvedValue(mockCancelledResponse);
      const result = await controller.cancelCheckIn(PASSENGER_ID, CHECKIN_ID);
      expect(result).toEqual(mockCancelledResponse);
      expect(checkInService.cancelCheckIn).toHaveBeenCalledWith({
        checkInId: CHECKIN_ID,
        passengerId: PASSENGER_ID,
      });
    });

    it("When service throws, Then exception propagates to caller", async () => {
      checkInService.cancelCheckIn.mockRejectedValue(
        new Error("Cancellation not allowed"),
      );
      await expect(
        controller.cancelCheckIn(PASSENGER_ID, CHECKIN_ID),
      ).rejects.toThrow("Cancellation not allowed");
    });
  });
});
