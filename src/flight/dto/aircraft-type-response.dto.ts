/**
 * Response DTO for aircraft type information embedded in flight responses.
 */
export class AircraftTypeResponseDto {
  readonly id!: string;
  readonly name!: string;
  readonly rows!: number;
  readonly columns!: string;
}
