import { MetricsService } from "./metrics.service";

const mockLabelsFn = () => ({
  inc: jest.fn(),
  dec: jest.fn(),
  observe: jest.fn(),
  set: jest.fn(),
});

/**
 * Creates a mock MetricsService for unit tests.
 * All metric methods return chainable label/observe/inc/dec stubs.
 */
export const createMockMetricsService = (): jest.Mocked<MetricsService> =>
  ({
    seatMapRequestsTotal: { labels: jest.fn().mockReturnValue(mockLabelsFn()) },
    seatHoldDurationSeconds: { labels: jest.fn().mockReturnValue(mockLabelsFn()) },
    seatContentionTotal: { labels: jest.fn().mockReturnValue(mockLabelsFn()) },
    holdExpiryTotal: { labels: jest.fn().mockReturnValue(mockLabelsFn()) },
    checkinDurationSeconds: { labels: jest.fn().mockReturnValue(mockLabelsFn()) },
    waitlistDepth: { labels: jest.fn().mockReturnValue(mockLabelsFn()) },
    waitlistAssignmentTotal: { labels: jest.fn().mockReturnValue(mockLabelsFn()) },
    abuseEventsTotal: { labels: jest.fn().mockReturnValue(mockLabelsFn()) },
    paymentRequestDurationSeconds: { labels: jest.fn().mockReturnValue(mockLabelsFn()) },
    httpRequestDurationSeconds: { labels: jest.fn().mockReturnValue(mockLabelsFn()) },
  }) as unknown as jest.Mocked<MetricsService>;
