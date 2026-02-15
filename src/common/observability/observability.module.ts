import { Global, Module } from "@nestjs/common";
import { MetricsService } from "./metrics.service";

/**
 * Global observability module providing MetricsService across the application.
 * Tracing utilities are pure functions and do not require DI.
 */
@Global()
@Module({
  providers: [MetricsService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
