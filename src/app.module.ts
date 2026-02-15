import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LoggerModule } from "nestjs-pino";
import { PrometheusModule } from "@willsoto/nestjs-prometheus";
import { envValidationSchema } from "./common/config/env.validation";
import { JwtAuthGuard } from "./common/guards";
import { RedisModule } from "./common/redis";
import { ObservabilityModule } from "./common/observability";
import { LoggingInterceptor } from "./common/interceptors";
import { HealthModule } from "./health/health.module";
import { FlightModule } from "./flight/flight.module";
import { SeatModule } from "./seat/seat.module";
import { CheckInModule } from "./check-in/check-in.module";
import { WaitlistModule } from "./waitlist/waitlist.module";
import { NotificationModule } from "./notification/notification.module";
import { AuditModule } from "./audit/audit.module";
import { getTraceContext } from "./common/observability";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres" as const,
        url: configService.get<string>("DATABASE_URL"),
        entities: [__dirname + "/**/*.entity{.ts,.js}"],
        migrations: [__dirname + "/../migrations/*{.ts,.js}"],
        synchronize: false,
        logging: configService.get<string>("NODE_ENV") !== "production",
      }),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty", options: { colorize: true } }
            : undefined,
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        customProps: () => {
          const { traceId, spanId } = getTraceContext();
          return { traceId, spanId };
        },
        genReqId: (req) =>
          (req.headers["x-request-id"] as string) ?? crypto.randomUUID(),
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    }),
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "1h" },
      }),
    }),
    ScheduleModule.forRoot(),
    RedisModule,
    ObservabilityModule,
    HealthModule,
    FlightModule,
    SeatModule,
    CheckInModule,
    WaitlistModule,
    NotificationModule,
    AuditModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
