import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { maskSensitiveData } from '../../common/utils/data-masking.util';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) { }

  /**
   * Records an audit event with sensitive data automatically redacted.
   * Optionally accepts an EntityManager to participate in an active database transaction.
   */
  async log(
    dto: CreateAuditLogDto,
    entityManager?: EntityManager,
  ): Promise<AuditLog> {
    // Scrub metadata for secrets, credentials, and PII
    const sanitizedMetadata = dto.metadata
      ? maskSensitiveData(dto.metadata)
      : null;

    const auditEntry = new AuditLog();
    auditEntry.entityName = dto.entityName;
    auditEntry.entityId = dto.entityId;
    auditEntry.action = dto.action;
    auditEntry.actorId = dto.actorId;
    auditEntry.actorRole = dto.actorRole;
    auditEntry.metadata = sanitizedMetadata;

    if (entityManager) {
      // Persist within the caller's active database transaction (ACID coupled)
      return entityManager.save(AuditLog, auditEntry);
    }

    return this.auditLogRepository.save(auditEntry);
  }

  /**
   * Retrieves chronological audit history for a specific entity.
   */
  async findByEntity(
    entityName: string,
    entityId: string,
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { entityName, entityId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Retrieves audit logs with optional filters and pagination.
   */
  async findAll(
    query: QueryAuditLogDto,
  ): Promise<{ data: AuditLog[]; total: number }> {
    const where: Record<string, any> = {};
    if (query.entityName) where.entityName = query.entityName;
    if (query.entityId) where.entityId = query.entityId;

    const [data, total] = await this.auditLogRepository.findAndCount({
      where: Object.keys(where).length > 0 ? where : undefined,
      order: { createdAt: 'DESC' },
      take: query.limit ?? 50,
      skip: query.offset ?? 0,
    });
    return { data, total };
  }
}
