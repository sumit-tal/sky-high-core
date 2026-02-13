import { Controller, Get } from "@nestjs/common";
import { Public } from "../common/decorators";

interface HealthCheckResponse {
  status: string;
  timestamp: string;
}

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  check(): HealthCheckResponse {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}
