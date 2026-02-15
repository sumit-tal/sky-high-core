import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Seat } from "./seat.entity";
import { Flight } from "../flight/flight.entity";
import { SeatController } from "./seat.controller";
import { SeatService } from "./seat.service";
import { RateLimiterMiddleware } from "../common/middleware";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [TypeOrmModule.forFeature([Seat, Flight]), AuditModule],
  controllers: [SeatController],
  providers: [SeatService],
  exports: [SeatService],
})
export class SeatModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RateLimiterMiddleware).forRoutes(SeatController);
  }
}
