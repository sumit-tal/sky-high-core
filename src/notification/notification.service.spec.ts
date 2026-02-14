import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { of, throwError } from "rxjs";
import { AxiosResponse, AxiosHeaders } from "axios";
import { NotificationService } from "./notification.service";
import {
  NotificationEventType,
  WaitlistNotificationPayload,
  NotificationResponse,
} from "./dto";

const MOCK_NOTIFICATION_URL = "http://stub-notification:3003";
const MOCK_TIMEOUT_MS = 5000;

const PASSENGER_ID = "passenger-uuid-1";
const FLIGHT_ID = "flight-uuid-1";
const SEAT_ID = "seat-uuid-1";
const WAITLIST_ENTRY_ID = "waitlist-uuid-1";

const createMockPayload = (): WaitlistNotificationPayload => ({
  passengerId: PASSENGER_ID,
  flightId: FLIGHT_ID,
  seatId: SEAT_ID,
  waitlistEntryId: WAITLIST_ENTRY_ID,
});

const createMockNotificationResponse = (): NotificationResponse => ({
  notificationId: "notif_123456",
  type: NotificationEventType.WAITLIST_SEAT_ASSIGNED,
  passengerId: PASSENGER_ID,
  status: "accepted",
  timestamp: new Date().toISOString(),
});

const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
  data,
  status: 202,
  statusText: "Accepted",
  headers: {},
  config: { headers: new AxiosHeaders() },
});

describe("NotificationService", () => {
  let service: NotificationService;
  let httpService: { post: jest.Mock };
  let loggerLogSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    httpService = { post: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: HttpService, useValue: httpService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                NOTIFICATION_SERVICE_URL: MOCK_NOTIFICATION_URL,
                NOTIFICATION_TIMEOUT_MS: String(MOCK_TIMEOUT_MS),
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();
    service = module.get<NotificationService>(NotificationService);
    loggerLogSpy = jest.spyOn(service["logger"], "log").mockImplementation();
    loggerErrorSpy = jest
      .spyOn(service["logger"], "error")
      .mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("handleWaitlistAssignment", () => {
    describe("When notification is sent successfully", () => {
      it("Then it should call the stub service with correct payload", async () => {
        const mockResponse = createMockNotificationResponse();
        httpService.post.mockReturnValue(of(createAxiosResponse(mockResponse)));
        const payload = createMockPayload();
        await service.handleWaitlistAssignment(payload);
        expect(httpService.post).toHaveBeenCalledWith(
          `${MOCK_NOTIFICATION_URL}/api/v1/notifications`,
          {
            type: NotificationEventType.WAITLIST_SEAT_ASSIGNED,
            passengerId: PASSENGER_ID,
            payload: {
              flightId: FLIGHT_ID,
              seatId: SEAT_ID,
              waitlistEntryId: WAITLIST_ENTRY_ID,
            },
          },
        );
      });

      it("Then it should log the successful notification", async () => {
        const mockResponse = createMockNotificationResponse();
        httpService.post.mockReturnValue(of(createAxiosResponse(mockResponse)));
        const payload = createMockPayload();
        await service.handleWaitlistAssignment(payload);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining("Notification sent successfully"),
        );
      });
    });

    describe("When notification service is unavailable", () => {
      it("Then it should not throw an error (fire-and-forget)", async () => {
        httpService.post.mockReturnValue(
          throwError(() => new Error("Connection refused")),
        );
        const payload = createMockPayload();
        await expect(
          service.handleWaitlistAssignment(payload),
        ).resolves.not.toThrow();
      });

      it("Then it should log the failure", async () => {
        httpService.post.mockReturnValue(
          throwError(() => new Error("Connection refused")),
        );
        const payload = createMockPayload();
        await service.handleWaitlistAssignment(payload);
        expect(loggerErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Failed to send notification"),
        );
        expect(loggerErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Connection refused"),
        );
      });
    });

    describe("When notification service times out", () => {
      it("Then it should not throw an error", async () => {
        httpService.post.mockReturnValue(
          throwError(() => new Error("Timeout has occurred")),
        );
        const payload = createMockPayload();
        await expect(
          service.handleWaitlistAssignment(payload),
        ).resolves.not.toThrow();
      });

      it("Then it should log the timeout error", async () => {
        httpService.post.mockReturnValue(
          throwError(() => new Error("Timeout has occurred")),
        );
        const payload = createMockPayload();
        await service.handleWaitlistAssignment(payload);
        expect(loggerErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Timeout has occurred"),
        );
      });
    });

    describe("When notification service returns an error status", () => {
      it("Then it should not throw an error", async () => {
        httpService.post.mockReturnValue(
          throwError(() => new Error("Request failed with status code 500")),
        );
        const payload = createMockPayload();
        await expect(
          service.handleWaitlistAssignment(payload),
        ).resolves.not.toThrow();
      });
    });

    describe("When payload contains all required fields", () => {
      it("Then it should include passengerId, flightId, and seatId in the request", async () => {
        const mockResponse = createMockNotificationResponse();
        httpService.post.mockReturnValue(of(createAxiosResponse(mockResponse)));
        const payload = createMockPayload();
        await service.handleWaitlistAssignment(payload);
        const callArgs = httpService.post.mock.calls[0][1];
        expect(callArgs.passengerId).toBe(PASSENGER_ID);
        expect(callArgs.payload.flightId).toBe(FLIGHT_ID);
        expect(callArgs.payload.seatId).toBe(SEAT_ID);
      });
    });

    describe("When an unknown error occurs", () => {
      it("Then it should handle non-Error objects gracefully", async () => {
        httpService.post.mockReturnValue(
          throwError(() => "string error"),
        );
        const payload = createMockPayload();
        await expect(
          service.handleWaitlistAssignment(payload),
        ).resolves.not.toThrow();
        expect(loggerErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Unknown error"),
        );
      });
    });
  });
});
