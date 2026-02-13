import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from "@nestjs/terminus";
import { Public } from "../common/decorators";
import { RedisHealthIndicator } from "./redis-health.indicator";

/**
 * Health check controller for liveness and readiness probes.
 * Verifies connectivity to PostgreSQL and Redis.
 */
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck("postgres"),
      () => this.redis.isHealthy("redis"),
    ]);
  }
}
