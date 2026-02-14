import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LoggerModule } from "nestjs-pino";
import { PrometheusModule } from "@willsoto/nestjs-prometheus";
import { envValidationSchema } from "./common/config/env.validation";
import { JwtAuthGuard } from "./common/guards";
import { RedisModule } from "./common/redis";
import { HealthModule } from "./health/health.module";
import { FlightModule } from "./flight/flight.module";
import { SeatModule } from "./seat/seat.module";
import { CheckInModule } from "./check-in/check-in.module";

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
    RedisModule,
    HealthModule,
    FlightModule,
    SeatModule,
    CheckInModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
