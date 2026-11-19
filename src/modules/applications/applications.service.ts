import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { MerchantApplication } from './entities/merchant-application.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { QueryApplicationsDto } from './dto/query-applications.dto';
import { PaginatedApplicationsResponseDto } from './dto/paginated-applications-response.dto';
import { ApplicationStatus } from './enums/application-status.enum';
import { RiskStatus } from './enums/risk-status.enum';
import { isEditable } from './state-machine/applications.state-machine';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRole } from '../users/enums/user-role.enum';

/**
 * Domain service managing the merchant application lifecycle, scoped database
 * queries (Tier-2 Anti-IDOR), anti-enumeration error handling, and transactional audit trails.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(MerchantApplication)
    private readonly applicationRepository: Repository<MerchantApplication>,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Creates a new merchant onboarding application in DRAFT status.
   * Atomically records an audit log entry in the same transaction.
   */
  async create(
    dto: CreateApplicationDto,
    user: AuthenticatedUser,
  ): Promise<MerchantApplication> {
    return this.dataSource.transaction(async (manager) => {
      const application = manager.create(MerchantApplication, {
        ...dto,
        status: ApplicationStatus.DRAFT,
        riskStatus: RiskStatus.NOT_STARTED,
        submissionVersion: 0,
        createdById: user.id,
        assignedReviewerId: null,
        decisionNote: null,
        decidedAt: null,
      });

      const saved = await manager.save(MerchantApplication, application);

      await this.auditService.log(
        {
          entityName: 'MerchantApplication',
          entityId: saved.id,
          action: 'APPLICATION_CREATED',
          actorId: user.id,
          actorRole: user.role,
          metadata: {
            businessName: saved.businessName,
            legalBusinessName: saved.legalBusinessName,
            businessType: saved.businessType,
            ownerEmail: saved.ownerEmail,
            ownerPhone: saved.ownerPhone,
            requestedMonthlyVolume: saved.requestedMonthlyVolume,
            requestedAvgTicket: saved.requestedAvgTicket,
            status: saved.status,
          },
        },
        manager,
      );

      return saved;
    });
  }

  /**
   * Retrieves paginated applications with Tier-2 authorization scoping:
   * - SALES: Can only view applications they personally created.
   * - REVIEWER: Can only view applications assigned to their queue.
   * - ADMIN: Operational unscoped access to all applications.
   */
  async findAll(
    user: AuthenticatedUser,
    query: QueryApplicationsDto,
  ): Promise<PaginatedApplicationsResponseDto> {
    const { page = 1, limit = 20, status } = query;
    const qb = this.applicationRepository.createQueryBuilder('app');

    this.applyAuthorizationScope(qb, user);

    if (status) {
      qb.andWhere('app.status = :status', { status });
    }

    qb.orderBy('app.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Retrieves an individual application by ID enforcing Tier-2 ownership scoping.
   *
   * Anti-Enumeration Invariant:
   * Returns 404 Not Found if the record does not exist OR exists outside the caller's scope.
   * Never returns 403 Forbidden to prevent leaking resource existence.
   */
  async findOne(
    id: string,
    user: AuthenticatedUser,
  ): Promise<MerchantApplication> {
    const qb = this.applicationRepository
      .createQueryBuilder('app')
      .where('app.id = :id', { id });

    this.applyAuthorizationScope(qb, user);

    const application = await qb.getOne();

    if (!application) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }

    return application;
  }

  /**
   * Updates an application in DRAFT or INFO_REQUESTED status.
   *
   * Invariants:
   * - Scoped by caller ownership (404 if outside scope).
   * - Blocked with 409 Conflict if application is in SUBMITTED, APPROVED, or REJECTED.
   * - Atomically saves changes and writes an audit log diff.
   */
  async update(
    id: string,
    dto: UpdateApplicationDto,
    user: AuthenticatedUser,
  ): Promise<MerchantApplication> {
    // Reviewers are not permitted to edit application details
    if (user.role === UserRole.REVIEWER) {
      throw new ForbiddenException(
        'Reviewers are not permitted to edit application details',
      );
    }

    const application = await this.findOne(id, user);

    // Lifecycle Invariant: Editability check
    if (!isEditable(application.status)) {
      throw new ConflictException(
        `Application cannot be updated in status '${application.status}'. Updates are only permitted in DRAFT or INFO_REQUESTED status.`,
      );
    }

    // Calculate changed fields for audit diff
    const changes: Record<string, { from: any; to: any }> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined && (application as any)[key] !== value) {
        changes[key] = { from: (application as any)[key], to: value };
      }
    }

    // If no values changed, return existing entity
    if (Object.keys(changes).length === 0) {
      return application;
    }

    return this.dataSource.transaction(async (manager) => {
      Object.assign(application, dto);
      const updated = await manager.save(MerchantApplication, application);

      await this.auditService.log(
        {
          entityName: 'MerchantApplication',
          entityId: updated.id,
          action: 'APPLICATION_UPDATED',
          actorId: user.id,
          actorRole: user.role,
          metadata: {
            updatedFields: Object.keys(changes),
            changes,
          },
        },
        manager,
      );

      return updated;
    });
  }

  /**
   * Applies Tier-2 authorization scoping directly to the database query:
   * - SALES: Restricted to applications created by the caller.
   * - REVIEWER: Restricted to applications assigned to the caller.
   * - ADMIN: Unscoped operational access.
   */
  private applyAuthorizationScope(
    qb: SelectQueryBuilder<MerchantApplication>,
    user: AuthenticatedUser,
  ): void {
    if (user.role === UserRole.SALES) {
      qb.andWhere('app.createdById = :userId', { userId: user.id });
    } else if (user.role === UserRole.REVIEWER) {
      qb.andWhere('app.assignedReviewerId = :userId', { userId: user.id });
    }
  }
}
