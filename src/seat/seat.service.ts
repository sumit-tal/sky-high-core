import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Seat } from "./seat.entity";
import { Flight } from "../flight/flight.entity";
import { FlightNotFoundException } from "../common/filters/exceptions";
import { RedisService, RedisKey } from "../common/redis";
import { MetricsService } from "../common/observability";
import { SeatMapResponseDto, SeatResponseDto } from "./dto";

/**
 * Service for seat map retrieval with Redis caching.
 * Cache key: seatmap:{flightId}, TTL: 2s.
 */
@Injectable()
export class SeatService {
  private readonly logger = new Logger(SeatService.name);

  constructor(
    @InjectRepository(Seat)
    private readonly seatRepository: Repository<Seat>,
    @InjectRepository(Flight)
    private readonly flightRepository: Repository<Flight>,
    private readonly redisService: RedisService,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Returns the seat map for a flight, using Redis cache when available.
   * @throws FlightNotFoundException if the flight does not exist.
   */
  async getSeatMap(flightId: string): Promise<SeatMapResponseDto> {
    const cacheKey = RedisKey.seatMapCache(flightId);
    const cached = await this.redisService.getSeatMapCache(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for seat map: ${flightId}`);
      this.metricsService.seatMapRequestsTotal
        .labels({ flight_id: flightId, status: "success" })
        .inc();
      return JSON.parse(cached) as SeatMapResponseDto;
    }
    this.logger.debug(`Cache miss for seat map: ${flightId}`);
    const flight = await this.flightRepository.findOne({
      where: { id: flightId },
      relations: ["aircraftType"],
    });
    if (!flight) {
      throw new FlightNotFoundException(
        `Flight with id '${flightId}' was not found`,
      );
    }
    const seats = await this.seatRepository.find({
      where: { flightId },
      order: { row: "ASC", column: "ASC" },
    });
    const seatMapResponse = this.toSeatMapResponse(flight, seats);
    await this.redisService.setSeatMapCache(
      cacheKey,
      JSON.stringify(seatMapResponse),
    );
    this.metricsService.seatMapRequestsTotal
      .labels({ flight_id: flightId, status: "success" })
      .inc();
    return seatMapResponse;
  }

  /**
   * Invalidates the cached seat map for a given flight.
   * Should be called whenever a seat state changes on the flight.
   */
  async invalidateCache(flightId: string): Promise<void> {
    const cacheKey = RedisKey.seatMapCache(flightId);
    await this.redisService.del(cacheKey);
    this.logger.debug(`Cache invalidated for seat map: ${flightId}`);
  }

  private toSeatMapResponse(flight: Flight, seats: Seat[]): SeatMapResponseDto {
    return {
      flightId: flight.id,
      aircraft: flight.aircraftType.name,
      seats: seats.map((seat) => this.toSeatResponse(seat)),
    };
  }

  private toSeatResponse(seat: Seat): SeatResponseDto {
    return {
      id: seat.id,
      row: seat.row,
      column: seat.column,
      status: seat.status,
    };
  }
}
