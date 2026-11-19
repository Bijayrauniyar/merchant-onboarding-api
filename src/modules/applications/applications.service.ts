import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { MerchantApplication } from './entities/merchant-application.entity';
import { User } from '../users/entities/user.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { QueryApplicationsDto } from './dto/query-applications.dto';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import { RecordDecisionDto } from './dto/record-decision.dto';
import { PaginatedApplicationsResponseDto } from './dto/paginated-applications-response.dto';
import { ApplicationStatus } from './enums/application-status.enum';
import { RiskStatus } from './enums/risk-status.enum';
import { ApplicationAction } from './enums/application-action.enum';
import { ReviewerDecision } from './enums/reviewer-decision.enum';
import {
  canTransition,
  getNextStatus,
  isEditable,
} from './state-machine/applications.state-machine';
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
   * Submits an application for review.
   *
   * Lifecycle Invariant:
   * - Permitted only in DRAFT (Action: SUBMIT) or INFO_REQUESTED (Action: RESUBMIT) status.
   * - Locked states (SUBMITTED, APPROVED, REJECTED) throw 409 Conflict.
   * - Enforces ownership scoping (404 Not Found if outside caller scope).
   * - Increments submissionVersion monotonically and sets riskStatus to PENDING.
   * - Records APPLICATION_SUBMITTED audit log atomically inside the transaction.
   */
  async submit(
    id: string,
    user: AuthenticatedUser,
  ): Promise<MerchantApplication> {
    const application = await this.findOne(id, user);

    const action =
      application.status === ApplicationStatus.INFO_REQUESTED
        ? ApplicationAction.RESUBMIT
        : ApplicationAction.SUBMIT;

    if (!canTransition(application.status, action)) {
      throw new ConflictException(
        `Application cannot be submitted in status '${application.status}'. Submission is only permitted in DRAFT or INFO_REQUESTED status.`,
      );
    }

    const previousStatus = application.status;
    const nextStatus = getNextStatus(application.status, action);

    return this.dataSource.transaction(async (manager) => {
      application.status = nextStatus;
      application.riskStatus = RiskStatus.PENDING;
      application.submissionVersion += 1;

      const saved = await manager.save(MerchantApplication, application);

      await this.auditService.log(
        {
          entityName: 'MerchantApplication',
          entityId: saved.id,
          action: 'APPLICATION_SUBMITTED',
          actorId: user.id,
          actorRole: user.role,
          metadata: {
            previousStatus,
            newStatus: saved.status,
            riskStatus: saved.riskStatus,
            submissionVersion: saved.submissionVersion,
          },
        },
        manager,
      );

      return saved;
    });
  }

  /**
   * Assigns a designated reviewer to an application in SUBMITTED status.
   *
   * Invariants:
   * - Restricted to ADMIN users (route guard + defense in depth).
   * - Target application must exist (404 Not Found if missing).
   * - Target application must be in SUBMITTED status (409 Conflict if not).
   * - Target user must exist and hold the REVIEWER role (400 Bad Request if not).
   * - Atomically updates assignedReviewerId and writes a REVIEWER_ASSIGNED audit log.
   */
  async assignReviewer(
    id: string,
    dto: AssignReviewerDto,
    adminUser: AuthenticatedUser,
  ): Promise<MerchantApplication> {
    if (adminUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Only administrators are permitted to assign reviewers',
      );
    }

    const application = await this.findOne(id, adminUser);

    if (application.status !== ApplicationStatus.SUBMITTED) {
      throw new ConflictException(
        `Application must be in SUBMITTED status to assign a reviewer. Current status: '${application.status}'.`,
      );
    }

    const reviewer = await this.userRepository.findOne({
      where: { id: dto.reviewerId },
    });

    if (!reviewer || reviewer.role !== UserRole.REVIEWER) {
      throw new BadRequestException(
        `Assigned user with ID '${dto.reviewerId}' does not exist or does not hold the REVIEWER role.`,
      );
    }

    const previousReviewerId = application.assignedReviewerId;

    return this.dataSource.transaction(async (manager) => {
      application.assignedReviewerId = reviewer.id;

      const saved = await manager.save(MerchantApplication, application);

      await this.auditService.log(
        {
          entityName: 'MerchantApplication',
          entityId: saved.id,
          action: 'REVIEWER_ASSIGNED',
          actorId: adminUser.id,
          actorRole: adminUser.role,
          metadata: {
            reviewerId: reviewer.id,
            reviewerEmail: reviewer.email,
            previousReviewerId,
          },
        },
        manager,
      );

      return saved;
    });
  }

  /**
   * Records an official determination (APPROVE, REJECT, REQUEST_INFO) by the assigned reviewer.
   *
   * Invariants & Security:
   * - Restricted to the assigned REVIEWER.
   * - Anti-enumeration: If application doesn't exist or is not assigned to this reviewer,
   *   findOne throws 404 Not Found (never leaks resource existence via 403).
   * - Defense-in-depth: If non-reviewer calls service directly, throws 403 Forbidden.
   * - Status gating: Application must be in SUBMITTED status (409 Conflict if not).
   * - Risk gating: Strictly blocked with 409 Conflict if riskStatus is PENDING.
   * - Note validation: Mandatory for REJECT and REQUEST_INFO (min 5 chars), optional for APPROVE.
   * - Atomic transition: State updated, decidedAt set if terminal, DECISION_RECORDED audit log emitted in transaction.
   */
  async recordDecision(
    id: string,
    dto: RecordDecisionDto,
    reviewer: AuthenticatedUser,
  ): Promise<MerchantApplication> {
    if (reviewer.role !== UserRole.REVIEWER) {
      throw new ForbiddenException(
        'Only reviewers are permitted to record application decisions.',
      );
    }

    const application = await this.findOne(id, reviewer);

    if (application.status !== ApplicationStatus.SUBMITTED) {
      throw new ConflictException(
        `Application must be in SUBMITTED status to record a decision. Current status: '${application.status}'.`,
      );
    }

    if (application.riskStatus === RiskStatus.PENDING) {
      throw new ConflictException(
        'Automated risk review is still in progress. Reviewer decisions are gated until completion.',
      );
    }

    const actionMap: Record<ReviewerDecision, ApplicationAction> = {
      [ReviewerDecision.APPROVE]: ApplicationAction.APPROVE,
      [ReviewerDecision.REJECT]: ApplicationAction.REJECT,
      [ReviewerDecision.REQUEST_INFO]: ApplicationAction.REQUEST_INFO,
    };

    const action = actionMap[dto.decision];
    if (!canTransition(application.status, action)) {
      throw new ConflictException(
        `Cannot perform decision '${dto.decision}' on application in status '${application.status}'.`,
      );
    }

    if (
      dto.decision !== ReviewerDecision.APPROVE &&
      (!dto.note || dto.note.trim().length < 5)
    ) {
      throw new BadRequestException(
        `A valid explanatory note (at least 5 characters) is required when decision is ${dto.decision}.`,
      );
    }

    const nextStatus = getNextStatus(application.status, action);
    const previousStatus = application.status;

    return this.dataSource.transaction(async (manager) => {
      application.status = nextStatus;
      application.decisionNote = dto.note || null;
      application.decidedAt =
        nextStatus === ApplicationStatus.APPROVED ||
        nextStatus === ApplicationStatus.REJECTED
          ? new Date()
          : null;

      const saved = await manager.save(MerchantApplication, application);

      await this.auditService.log(
        {
          entityName: 'MerchantApplication',
          entityId: saved.id,
          action: 'DECISION_RECORDED',
          actorId: reviewer.id,
          actorRole: reviewer.role,
          metadata: {
            decision: dto.decision,
            previousStatus,
            newStatus: saved.status,
            riskStatus: saved.riskStatus,
            decisionNote: saved.decisionNote,
            decidedAt: saved.decidedAt,
          },
        },
        manager,
      );

      return saved;
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
