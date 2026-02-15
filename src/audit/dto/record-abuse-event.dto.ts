export interface RecordAbuseEventDto {
  readonly sourceIp: string;
  readonly requestCount: number;
  readonly windowStart: Date;
  readonly windowEnd: Date;
  readonly details?: Record<string, unknown> | null;
}
