import { Test, TestingModule } from "@nestjs/testing";
import { SeatController } from "./seat.controller";
import { SeatService } from "./seat.service";
import { SeatMapResponseDto } from "./dto";
import { SeatStatus } from "../common/types/enums";

const FLIGHT_ID: string = "flight-uuid-1";
const mockSeatMapResponse: SeatMapResponseDto = {
  flightId: FLIGHT_ID,
  aircraft: "A320",
  seats: [
    { id: "seat-uuid-1", row: 1, column: "A", status: SeatStatus.AVAILABLE },
    { id: "seat-uuid-2", row: 1, column: "B", status: SeatStatus.HELD },
  ],
};

describe("SeatController", () => {
  let controller: SeatController;
  let seatService: jest.Mocked<SeatService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SeatController],
      providers: [
        {
          provide: SeatService,
          useValue: {
            getSeatMap: jest.fn(),
          },
        },
      ],
    }).compile();
    controller = module.get<SeatController>(SeatController);
    seatService = module.get(SeatService);
  });

  describe("getSeatMap", () => {
    it("When seat map requested, Then delegates to service and returns response", async () => {
      seatService.getSeatMap.mockResolvedValue(mockSeatMapResponse);
      const result = await controller.getSeatMap(FLIGHT_ID);
      expect(result).toEqual(mockSeatMapResponse);
      expect(seatService.getSeatMap).toHaveBeenCalledWith(FLIGHT_ID);
    });

    it("When service throws, Then exception propagates to caller", async () => {
      seatService.getSeatMap.mockRejectedValue(new Error("Service failure"));
      await expect(controller.getSeatMap(FLIGHT_ID)).rejects.toThrow(
        "Service failure",
      );
    });
  });
});
