import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApplicationStatus } from '../enums/application-status.enum';

/**
 * Query parameters for listing merchant applications with pagination and filters.
 */
export class QueryApplicationsDto {
  /**
   * 1-based page number for pagination
   * @default 1
   * @minimum 1
   * @example 1
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be at least 1' })
  page: number = 1;

  /**
   * Number of application records per page
   * @default 20
   * @minimum 1
   * @maximum 100
   * @example 20
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(100, { message: 'limit must not exceed 100' })
  limit: number = 20;

  /**
   * Filter applications by business lifecycle status
   * @example "SUBMITTED"
   */
  @IsOptional()
  @IsEnum(ApplicationStatus, {
    message: `status must be one of: ${Object.values(ApplicationStatus).join(', ')}`,
  })
  status?: ApplicationStatus;
}
