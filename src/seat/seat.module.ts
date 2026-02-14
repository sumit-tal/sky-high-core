import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Seat } from "./seat.entity";
import { Flight } from "../flight/flight.entity";
import { SeatController } from "./seat.controller";
import { SeatService } from "./seat.service";

@Module({
  imports: [TypeOrmModule.forFeature([Seat, Flight])],
  controllers: [SeatController],
  providers: [SeatService],
  exports: [SeatService],
})
export class SeatModule {}
