import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAuditLogDto {
  @IsString()
  @IsNotEmpty()
  entityName!: string;

  @IsUUID()
  @IsNotEmpty()
  entityId!: string;

  @IsString()
  @IsNotEmpty()
  action!: string;

  @IsString()
  @IsNotEmpty()
  actorId!: string;

  @IsString()
  @IsNotEmpty()
  actorRole!: string;

  @IsOptional()
  metadata?: Record<string, any> | null;
}
