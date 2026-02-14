import { FlightResponseDto } from './flight-response.dto';

/**
 * Response DTO for paginated flight list.
 */
export class PaginatedFlightsResponseDto {
  readonly data!: FlightResponseDto[];
  readonly meta!: PaginationMeta;
}

/**
 * Pagination metadata included in paginated responses.
 */
export class PaginationMeta {
  readonly page!: number;
  readonly limit!: number;
  readonly totalItems!: number;
  readonly totalPages!: number;
}
