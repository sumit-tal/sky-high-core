import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { PrometheusModule } from "@willsoto/nestjs-prometheus";
import { envValidationSchema } from "./common/config/env.validation";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty", options: { colorize: true } }
            : undefined,
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
      },
    }),
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
    }),
    HealthModule,
  ],
})
export class AppModule {}
