import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { OnEvent } from "@nestjs/event-emitter";
import { firstValueFrom } from "rxjs";
import { timeout } from "rxjs/operators";
import { WAITLIST_NOTIFICATION_EVENT } from "../waitlist/waitlist.service";
import {
  NotificationEventType,
  WaitlistNotificationPayload,
  NotificationRequest,
  NotificationResponse,
} from "./dto";

const DEFAULT_NOTIFICATION_TIMEOUT_MS = 5000;
const NOTIFICATIONS_PATH = "/api/v1/notifications";

/**
 * Service for sending passenger notifications via the stub Notification Service.
 * Uses fire-and-forget pattern: failures are logged but never block the main flow.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly notificationServiceUrl: string;
  private readonly httpTimeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.notificationServiceUrl = this.configService.get<string>(
      "NOTIFICATION_SERVICE_URL",
      "http://localhost:3003",
    );
    this.httpTimeoutMs = Number(
      this.configService.get<string>(
        "NOTIFICATION_TIMEOUT_MS",
        String(DEFAULT_NOTIFICATION_TIMEOUT_MS),
      ),
    );
  }

  /**
   * Handle waitlist seat assignment notification.
   * Listens for WAITLIST_NOTIFICATION_EVENT emitted by WaitlistService.
   * Fire-and-forget: errors are caught and logged, never re-thrown.
   */
  @OnEvent(WAITLIST_NOTIFICATION_EVENT)
  async handleWaitlistAssignment(
    payload: WaitlistNotificationPayload,
  ): Promise<void> {
    const { passengerId, flightId, seatId, waitlistEntryId } = payload;
    this.logger.log(
      `Sending waitlist assignment notification to passenger '${passengerId}' for seat '${seatId}' on flight '${flightId}'`,
    );
    const request: NotificationRequest = {
      type: NotificationEventType.WAITLIST_SEAT_ASSIGNED,
      passengerId,
      payload: { flightId, seatId, waitlistEntryId },
    };
    await this.sendNotification(request);
  }

  /**
   * Send a notification to the stub Notification Service.
   * Fire-and-forget: catches all errors and logs them without re-throwing.
   */
  private async sendNotification(
    request: NotificationRequest,
  ): Promise<NotificationResponse | null> {
    const url = `${this.notificationServiceUrl}${NOTIFICATIONS_PATH}`;
    try {
      const response = await firstValueFrom(
        this.httpService
          .post<NotificationResponse>(url, request)
          .pipe(timeout(this.httpTimeoutMs)),
      );
      this.logger.log(
        `Notification sent successfully: id='${response.data.notificationId}', type='${request.type}', passenger='${request.passengerId}'`,
      );
      return response.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `Failed to send notification: type='${request.type}', passenger='${request.passengerId}', error='${message}'`,
      );
      return null;
    }
  }
}
