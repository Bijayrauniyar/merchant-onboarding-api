import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAuditLogDto {
  /**
   * Number of records to return
   * @default 50
   * @minimum 1
   * @maximum 100
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  /**
   * Number of records to skip
   * @default 0
   * @minimum 0
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;

  /**
   * Filter by entity type (e.g. MerchantApplication)
   */
  @IsOptional()
  @IsString()
  entityName?: string;

  /**
   * Filter by specific entity UUID
   */
  @IsOptional()
  @IsUUID()
  entityId?: string;
}
