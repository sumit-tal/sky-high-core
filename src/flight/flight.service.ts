import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Flight } from './flight.entity';
import { FlightNotFoundException } from '../common/filters/exceptions';
import {
  FlightResponseDto,
  PaginatedFlightsResponseDto,
  AircraftTypeResponseDto,
} from './dto';

/**
 * Service for read-only flight operations.
 */
@Injectable()
export class FlightService {
  constructor(
    @InjectRepository(Flight)
    private readonly flightRepository: Repository<Flight>,
  ) {}

  /**
   * Returns a paginated list of flights with aircraft type info.
   */
  async findAll({ page, limit }: { page: number; limit: number }): Promise<PaginatedFlightsResponseDto> {
    const skip = (page - 1) * limit;
    const [flights, totalItems] = await this.flightRepository.findAndCount({
      relations: ['aircraftType'],
      order: { departureTime: 'ASC' },
      skip,
      take: limit,
    });
    const totalPages = Math.ceil(totalItems / limit);
    return {
      data: flights.map((flight) => this.toFlightResponse(flight)),
      meta: { page, limit, totalItems, totalPages },
    };
  }

  /**
   * Returns a single flight by ID with aircraft type info.
   * @throws FlightNotFoundException if the flight does not exist.
   */
  async findOne(flightId: string): Promise<FlightResponseDto> {
    const flight = await this.flightRepository.findOne({
      where: { id: flightId },
      relations: ['aircraftType'],
    });
    if (!flight) {
      throw new FlightNotFoundException(`Flight with id '${flightId}' was not found`);
    }
    return this.toFlightResponse(flight);
  }

  private toFlightResponse(flight: Flight): FlightResponseDto {
    const aircraftType: AircraftTypeResponseDto = {
      id: flight.aircraftType.id,
      name: flight.aircraftType.name,
      rows: flight.aircraftType.rows,
      columns: flight.aircraftType.columns,
    };
    return {
      id: flight.id,
      flightNumber: flight.flightNumber,
      departureTime: flight.departureTime,
      status: flight.status,
      aircraftType,
    };
  }
}
