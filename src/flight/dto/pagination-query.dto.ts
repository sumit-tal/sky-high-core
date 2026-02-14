import { IsInt, IsOptional, Max, Min } from 'class-validator';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * Query parameters for paginated list endpoints.
 */
export class PaginationQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly page: number = DEFAULT_PAGE;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  readonly limit: number = DEFAULT_LIMIT;
}
