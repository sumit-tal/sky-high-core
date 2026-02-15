import { Injectable } from "@nestjs/common";
import {
  Counter,
  Gauge,
  Histogram,
  register,
} from "prom-client";

/**
 * Centralized Prometheus metrics service.
 * Exposes all custom business metrics defined in Technical PRD §10.2.
 * Metrics are registered once and shared across the application.
 */
@Injectable()
export class MetricsService {
  /** Total seat map requests by flight and HTTP status */
  readonly seatMapRequestsTotal: Counter<"flight_id" | "status">;

  /** Duration of seat holds in seconds */
  readonly seatHoldDurationSeconds: Histogram<"flight_id">;

  /** Total seat contention events (CAS failures) by flight */
  readonly seatContentionTotal: Counter<"flight_id">;

  /** Total hold expiry events by flight and mechanism (keyspace | sweep) */
  readonly holdExpiryTotal: Counter<"flight_id" | "mechanism">;

  /** Duration of the full check-in flow in seconds */
  readonly checkinDurationSeconds: Histogram<"flight_id" | "status">;

  /** Current waitlist depth per flight */
  readonly waitlistDepth: Gauge<"flight_id">;

  /** Total waitlist auto-assignment events by flight */
  readonly waitlistAssignmentTotal: Counter<"flight_id">;

  /** Total abuse events detected by source IP */
  readonly abuseEventsTotal: Counter<"source_ip">;

  /** Duration of payment service requests in seconds */
  readonly paymentRequestDurationSeconds: Histogram<"status">;

  /** Duration of HTTP requests in seconds */
  readonly httpRequestDurationSeconds: Histogram<"method" | "path" | "status">;

  constructor() {
    this.seatMapRequestsTotal = this.getOrCreateCounter(
      "skyhigh_seat_map_requests_total",
      "Total seat map requests",
      ["flight_id", "status"],
    );
    this.seatHoldDurationSeconds = this.getOrCreateHistogram(
      "skyhigh_seat_hold_duration_seconds",
      "Duration of seat holds in seconds",
      ["flight_id"],
      [5, 15, 30, 60, 90, 120, 150],
    );
    this.seatContentionTotal = this.getOrCreateCounter(
      "skyhigh_seat_contention_total",
      "Total seat contention events (CAS failures)",
      ["flight_id"],
    );
    this.holdExpiryTotal = this.getOrCreateCounter(
      "skyhigh_hold_expiry_total",
      "Total hold expiry events",
      ["flight_id", "mechanism"],
    );
    this.checkinDurationSeconds = this.getOrCreateHistogram(
      "skyhigh_checkin_duration_seconds",
      "Duration of the full check-in flow in seconds",
      ["flight_id", "status"],
      [0.1, 0.5, 1, 2, 5, 10, 30],
    );
    this.waitlistDepth = this.getOrCreateGauge(
      "skyhigh_waitlist_depth",
      "Current waitlist depth per flight",
      ["flight_id"],
    );
    this.waitlistAssignmentTotal = this.getOrCreateCounter(
      "skyhigh_waitlist_assignment_total",
      "Total waitlist auto-assignment events",
      ["flight_id"],
    );
    this.abuseEventsTotal = this.getOrCreateCounter(
      "skyhigh_abuse_events_total",
      "Total abuse events detected",
      ["source_ip"],
    );
    this.paymentRequestDurationSeconds = this.getOrCreateHistogram(
      "skyhigh_payment_request_duration_seconds",
      "Duration of payment service requests in seconds",
      ["status"],
      [0.1, 0.5, 1, 2, 5, 10],
    );
    this.httpRequestDurationSeconds = this.getOrCreateHistogram(
      "skyhigh_http_request_duration_seconds",
      "Duration of HTTP requests in seconds",
      ["method", "path", "status"],
      [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    );
  }

  private getOrCreateCounter<T extends string>(
    name: string,
    help: string,
    labelNames: T[],
  ): Counter<T> {
    const existing = register.getSingleMetric(name);
    if (existing) {
      return existing as Counter<T>;
    }
    return new Counter<T>({ name, help, labelNames });
  }

  private getOrCreateHistogram<T extends string>(
    name: string,
    help: string,
    labelNames: T[],
    buckets: number[],
  ): Histogram<T> {
    const existing = register.getSingleMetric(name);
    if (existing) {
      return existing as Histogram<T>;
    }
    return new Histogram<T>({ name, help, labelNames, buckets });
  }

  private getOrCreateGauge<T extends string>(
    name: string,
    help: string,
    labelNames: T[],
  ): Gauge<T> {
    const existing = register.getSingleMetric(name);
    if (existing) {
      return existing as Gauge<T>;
    }
    return new Gauge<T>({ name, help, labelNames });
  }
}
