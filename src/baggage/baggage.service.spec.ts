import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { of, throwError } from "rxjs";
import { BaggageService } from "./baggage.service";

const PASSENGER_ID = "passenger-uuid-1";
const MAX_BAGGAGE_KG = "25";
const EXCESS_FEE_PER_KG = "10";
const WEIGHT_SERVICE_URL = "http://stub-weight:3002";
const WEIGHT_SERVICE_TIMEOUT_MS = "5000";

const configMap: Record<string, string> = {
  MAX_BAGGAGE_WEIGHT_KG: MAX_BAGGAGE_KG,
  EXCESS_FEE_PER_KG: EXCESS_FEE_PER_KG,
  WEIGHT_SERVICE_URL: WEIGHT_SERVICE_URL,
  WEIGHT_SERVICE_TIMEOUT_MS: WEIGHT_SERVICE_TIMEOUT_MS,
};

describe("BaggageService", () => {
  let service: BaggageService;
  let httpService: jest.Mocked<HttpService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BaggageService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string, defaultValue: string) =>
                configMap[key] ?? defaultValue,
            ),
          },
        },
      ],
    }).compile();
    service = module.get<BaggageService>(BaggageService);
    httpService = module.get(HttpService);
  });

  describe("calculateFee", () => {
    it("When weight is under max, Then returns not overweight with zero fee", () => {
      const result = service.calculateFee(20);
      expect(result.isOverweight).toBe(false);
      expect(result.excessFee).toBe(0);
      expect(result.excessWeight).toBe(0);
      expect(result.weight).toBe(20);
      expect(result.maxAllowedWeight).toBe(25);
    });

    it("When weight equals max, Then returns not overweight with zero fee", () => {
      const result = service.calculateFee(25);
      expect(result.isOverweight).toBe(false);
      expect(result.excessFee).toBe(0);
      expect(result.excessWeight).toBe(0);
    });

    it("When weight exceeds max, Then returns overweight with correct fee", () => {
      const result = service.calculateFee(30);
      expect(result.isOverweight).toBe(true);
      expect(result.excessWeight).toBe(5);
      expect(result.excessFee).toBe(50);
    });

    it("When weight exceeds max by fractional amount, Then calculates fee correctly", () => {
      const result = service.calculateFee(28.5);
      expect(result.isOverweight).toBe(true);
      expect(result.excessWeight).toBe(3.5);
      expect(result.excessFee).toBe(35);
    });

    it("When weight is zero, Then returns not overweight with zero fee", () => {
      const result = service.calculateFee(0);
      expect(result.isOverweight).toBe(false);
      expect(result.excessFee).toBe(0);
    });
  });

  describe("validateAndCalculateFee", () => {
    it("When weight service responds, Then returns fee calculation result", async () => {
      httpService.get.mockReturnValue(
        of({
          data: { passengerId: PASSENGER_ID, weight: 20, unit: "kg" },
          status: 200,
        } as any),
      );
      const result = await service.validateAndCalculateFee({
        passengerId: PASSENGER_ID,
        declaredWeight: 20,
      });
      expect(result.isOverweight).toBe(false);
      expect(result.excessFee).toBe(0);
      expect(httpService.get).toHaveBeenCalledWith(
        `${WEIGHT_SERVICE_URL}/api/v1/baggage/weight/${PASSENGER_ID}`,
      );
    });

    it("When weight service fails, Then falls back to declared weight and calculates fee", async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error("Connection refused")),
      );
      const result = await service.validateAndCalculateFee({
        passengerId: PASSENGER_ID,
        declaredWeight: 30,
      });
      expect(result.isOverweight).toBe(true);
      expect(result.excessFee).toBe(50);
    });

    it("When weight service times out, Then falls back to declared weight", async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error("Timeout has occurred")),
      );
      const result = await service.validateAndCalculateFee({
        passengerId: PASSENGER_ID,
        declaredWeight: 28.5,
      });
      expect(result.isOverweight).toBe(true);
      expect(result.excessFee).toBe(35);
    });

    it("When excess baggage detected, Then returns correct excess weight and fee", async () => {
      httpService.get.mockReturnValue(
        of({
          data: { passengerId: PASSENGER_ID, weight: 28.5, unit: "kg" },
          status: 200,
        } as any),
      );
      const result = await service.validateAndCalculateFee({
        passengerId: PASSENGER_ID,
        declaredWeight: 28.5,
      });
      expect(result.isOverweight).toBe(true);
      expect(result.excessWeight).toBe(3.5);
      expect(result.excessFee).toBe(35);
    });
  });

  describe("getMaxBaggageKg", () => {
    it("When called, Then returns configured max baggage weight", () => {
      expect(service.getMaxBaggageKg()).toBe(25);
    });
  });

  describe("getExcessFeePerKg", () => {
    it("When called, Then returns configured excess fee per kg", () => {
      expect(service.getExcessFeePerKg()).toBe(10);
    });
  });
});
