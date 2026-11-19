import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { MerchantApplication } from './entities/merchant-application.entity';
import { User } from '../users/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { RiskProducer } from '../risk/risk.producer';
import { ApplicationStatus } from './enums/application-status.enum';
import { RiskStatus } from './enums/risk-status.enum';
import { BusinessType } from './enums/business-type.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { ReviewerDecision } from './enums/reviewer-decision.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let applicationRepository: jest.Mocked<Repository<MerchantApplication>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let auditService: jest.Mocked<AuditService>;
  let riskProducer: jest.Mocked<RiskProducer>;
  let dataSource: jest.Mocked<DataSource>;

  const salesUser: AuthenticatedUser = {
    id: 'user-sales-1',
    email: 'sales1@example.com',
    role: UserRole.SALES,
  };

  const reviewerUser: AuthenticatedUser = {
    id: 'user-reviewer-1',
    email: 'reviewer1@example.com',
    role: UserRole.REVIEWER,
  };

  const adminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
  };

  const mockApplication: MerchantApplication = {
    id: 'app-123',
    businessName: 'Acme Coffee Roasters',
    legalBusinessName: 'Acme Coffee Roasters LLC',
    businessType: BusinessType.LLC,
    ownerName: 'Jane Doe',
    ownerEmail: 'jane@acmepayments.com',
    ownerPhone: '+14155552671',
    requestedMonthlyVolume: 50000.0,
    requestedAvgTicket: 125.5,
    status: ApplicationStatus.DRAFT,
    riskStatus: RiskStatus.NOT_STARTED,
    submissionVersion: 0,
    createdById: 'user-sales-1',
    assignedReviewerId: null,
    decisionNote: null,
    decidedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockQueryBuilder: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getManyAndCount: jest.fn(),
    };

    const mockRepo = {
      createQueryBuilder: jest.fn(() => mockQueryBuilder),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    const mockUserRepo = {
      findOne: jest.fn(),
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue({} as any),
    };

    const mockRiskProducer = {
      enqueueRiskReview: jest.fn().mockResolvedValue(undefined),
    };

    const mockDataSource = {
      transaction: jest.fn(async (cb: (manager: any) => Promise<any>) => {
        const mockManager = {
          create: jest.fn((entityClass, data) => ({ ...data, id: 'app-123' })),
          save: jest.fn(async (entityClass, entity) => entity),
        };
        return cb(mockManager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        {
          provide: getRepositoryToken(MerchantApplication),
          useValue: mockRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: RiskProducer,
          useValue: mockRiskProducer,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<ApplicationsService>(ApplicationsService);
    applicationRepository = module.get(getRepositoryToken(MerchantApplication));
    userRepository = module.get(getRepositoryToken(User));
    auditService = module.get(AuditService);
    riskProducer = module.get(RiskProducer);
    dataSource = module.get(DataSource);
  });

  describe('create()', () => {
    it('should create an application in DRAFT status with submissionVersion = 0 and audit log', async () => {
      const createDto = {
        businessName: 'Acme Coffee Roasters',
        legalBusinessName: 'Acme Coffee Roasters LLC',
        businessType: BusinessType.LLC,
        ownerName: 'Jane Doe',
        ownerEmail: 'jane@acmepayments.com',
        ownerPhone: '+14155552671',
        requestedMonthlyVolume: 50000.0,
        requestedAvgTicket: 125.5,
      };

      const result = await service.create(createDto, salesUser);

      expect(result).toHaveProperty('id', 'app-123');
      expect(result.status).toBe(ApplicationStatus.DRAFT);
      expect(result.riskStatus).toBe(RiskStatus.NOT_STARTED);
      expect(result.submissionVersion).toBe(0);
      expect(result.createdById).toBe(salesUser.id);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPLICATION_CREATED',
          entityId: 'app-123',
          actorId: salesUser.id,
          actorRole: salesUser.role,
        }),
        expect.anything(),
      );
    });
  });

  describe('findAll() Tier-2 Query Scoping', () => {
    it('should scope queries for SALES role to app.createdById = user.id', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockApplication], 1]);

      const result = await service.findAll(salesUser, { page: 1, limit: 20 });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'app.createdById = :userId',
        { userId: salesUser.id },
      );
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should scope queries for REVIEWER role to app.assignedReviewerId = user.id', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll(reviewerUser, { page: 1, limit: 20 });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'app.assignedReviewerId = :userId',
        { userId: reviewerUser.id },
      );
    });

    it('should not add role-scoping where clause for ADMIN role (unscoped)', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockApplication], 1]);

      await service.findAll(adminUser, { page: 1, limit: 20 });

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        'app.createdById = :userId',
        expect.anything(),
      );
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        'app.assignedReviewerId = :userId',
        expect.anything(),
      );
    });

    it('should filter by status when provided in query parameters', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockApplication], 1]);

      await service.findAll(adminUser, {
        page: 1,
        limit: 20,
        status: ApplicationStatus.SUBMITTED,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'app.status = :status',
        { status: ApplicationStatus.SUBMITTED },
      );
    });
  });

  describe('findOne() Tier-2 Anti-Enumeration', () => {
    it('should return application when found within caller scope', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(mockApplication);

      const result = await service.findOne('app-123', salesUser);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('app.id = :id', {
        id: 'app-123',
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'app.createdById = :userId',
        { userId: salesUser.id },
      );
      expect(result).toEqual(mockApplication);
    });

    it('should throw NotFoundException (404) when application is outside caller scope (Anti-Enumeration)', async () => {
      // Database returns null because the WHERE createdById condition did not match
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await expect(service.findOne('app-foreign', salesUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update()', () => {
    it('should update fields and emit audit log when application is in editable DRAFT status', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.DRAFT,
      });

      const updateDto = { businessName: 'Acme Coffee Roasters Updated' };
      const result = await service.update('app-123', updateDto, salesUser);

      expect(result.businessName).toBe('Acme Coffee Roasters Updated');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPLICATION_UPDATED',
          entityId: 'app-123',
          actorId: salesUser.id,
          metadata: expect.objectContaining({
            updatedFields: ['businessName'],
          }),
        }),
        expect.anything(),
      );
    });

    it('should allow update when application is in INFO_REQUESTED status', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.INFO_REQUESTED,
      });

      const updateDto = { ownerPhone: '+14155559999' };
      const result = await service.update('app-123', updateDto, salesUser);

      expect(result.ownerPhone).toBe('+14155559999');
    });

    it('should throw ConflictException (409) when attempting update on SUBMITTED application', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      });

      await expect(
        service.update('app-123', { businessName: 'Locked' }, salesUser),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException (409) when attempting update on APPROVED application', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.APPROVED,
      });

      await expect(
        service.update('app-123', { businessName: 'Locked' }, salesUser),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ForbiddenException (403) when a REVIEWER attempts to update application details', async () => {
      await expect(
        service.update('app-123', { businessName: 'Hacked' }, reviewerUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException (404) when updating an application not owned by caller', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await expect(
        service.update('app-foreign', { businessName: 'Hacked' }, salesUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return existing application without transaction if no fields actually changed', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(mockApplication);

      const result = await service.update(
        'app-123',
        { businessName: mockApplication.businessName },
        salesUser,
      );

      expect(result).toEqual(mockApplication);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('submit()', () => {
    it('should submit an application in DRAFT status, set riskStatus to PENDING, increment version and record audit log', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.DRAFT,
        submissionVersion: 0,
        riskStatus: RiskStatus.NOT_STARTED,
      });

      const result = await service.submit('app-123', salesUser);

      expect(result.status).toBe(ApplicationStatus.SUBMITTED);
      expect(result.riskStatus).toBe(RiskStatus.PENDING);
      expect(result.submissionVersion).toBe(1);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(riskProducer.enqueueRiskReview).toHaveBeenCalledWith('app-123', 1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPLICATION_SUBMITTED',
          entityId: 'app-123',
          actorId: salesUser.id,
          metadata: expect.objectContaining({
            previousStatus: ApplicationStatus.DRAFT,
            newStatus: ApplicationStatus.SUBMITTED,
            riskStatus: RiskStatus.PENDING,
            submissionVersion: 1,
          }),
        }),
        expect.anything(),
      );
    });

    it('should resubmit an application in INFO_REQUESTED status and increment submissionVersion', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.INFO_REQUESTED,
        submissionVersion: 1,
        riskStatus: RiskStatus.PASSED,
      });

      const result = await service.submit('app-123', salesUser);

      expect(result.status).toBe(ApplicationStatus.SUBMITTED);
      expect(result.riskStatus).toBe(RiskStatus.PENDING);
      expect(result.submissionVersion).toBe(2);
      expect(riskProducer.enqueueRiskReview).toHaveBeenCalledWith('app-123', 2);
    });

    it('should dispatch risk review job strictly post-commit after transaction resolves', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.DRAFT,
        submissionVersion: 0,
        riskStatus: RiskStatus.NOT_STARTED,
      });

      const executionOrder: string[] = [];
      dataSource.transaction.mockImplementation(async (cb: any) => {
        executionOrder.push('transaction_begin');
        const res = await cb({
          save: jest.fn().mockImplementation((_, entity) => entity),
        });
        executionOrder.push('transaction_committed');
        return res;
      });

      riskProducer.enqueueRiskReview.mockImplementation(async () => {
        executionOrder.push('job_enqueued');
      });

      await service.submit('app-123', salesUser);

      expect(executionOrder).toEqual([
        'transaction_begin',
        'transaction_committed',
        'job_enqueued',
      ]);
    });

    it('should throw ConflictException (409) when attempting to submit an already SUBMITTED application', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      });

      await expect(service.submit('app-123', salesUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException (409) when attempting to submit an APPROVED or REJECTED application', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.APPROVED,
      });

      await expect(service.submit('app-123', salesUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException (404) when submitting an application outside caller scope', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await expect(service.submit('app-foreign', salesUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assignReviewer()', () => {
    const validReviewerId = 'reviewer-uuid-1';
    const mockReviewerUser = {
      id: validReviewerId,
      email: 'reviewer1@example.com',
      role: UserRole.REVIEWER,
    } as User;

    it('should assign a qualified reviewer to a SUBMITTED application and record audit log', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
        assignedReviewerId: null,
      });

      userRepository.findOne.mockResolvedValue(mockReviewerUser);

      const result = await service.assignReviewer(
        'app-123',
        { reviewerId: validReviewerId },
        adminUser,
      );

      expect(result.assignedReviewerId).toBe(validReviewerId);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REVIEWER_ASSIGNED',
          entityId: 'app-123',
          actorId: adminUser.id,
          metadata: expect.objectContaining({
            reviewerId: validReviewerId,
            reviewerEmail: 'reviewer1@example.com',
            previousReviewerId: null,
          }),
        }),
        expect.anything(),
      );
    });

    it('should throw ForbiddenException (403) when non-admin attempts assignment', async () => {
      await expect(
        service.assignReviewer(
          'app-123',
          { reviewerId: validReviewerId },
          salesUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException (409) when application is not in SUBMITTED status', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.DRAFT,
      });

      await expect(
        service.assignReviewer(
          'app-123',
          { reviewerId: validReviewerId },
          adminUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException (400) when target user does not exist', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      });

      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.assignReviewer(
          'app-123',
          { reviewerId: 'nonexistent-user' },
          adminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException (400) when target user does not hold REVIEWER role', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      });

      userRepository.findOne.mockResolvedValue({
        id: 'sales-user-id',
        email: 'sales@example.com',
        role: UserRole.SALES,
      } as User);

      await expect(
        service.assignReviewer(
          'app-123',
          { reviewerId: 'sales-user-id' },
          adminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException (404) when target application does not exist', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await expect(
        service.assignReviewer(
          'app-nonexistent',
          { reviewerId: validReviewerId },
          adminUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('recordDecision()', () => {
    const assignedApp: MerchantApplication = {
      ...mockApplication,
      status: ApplicationStatus.SUBMITTED,
      riskStatus: RiskStatus.PASSED,
      submissionVersion: 1,
      assignedReviewerId: reviewerUser.id,
    };

    it('should successfully approve an application and set status to APPROVED with decidedAt timestamp', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ ...assignedApp });

      const result = await service.recordDecision(
        'app-123',
        { decision: ReviewerDecision.APPROVE, note: 'All compliance checks passed' },
        reviewerUser,
      );

      expect(result.status).toBe(ApplicationStatus.APPROVED);
      expect(result.decisionNote).toBe('All compliance checks passed');
      expect(result.decidedAt).toBeInstanceOf(Date);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DECISION_RECORDED',
          entityId: 'app-123',
          actorId: reviewerUser.id,
          metadata: expect.objectContaining({
            decision: ReviewerDecision.APPROVE,
            previousStatus: ApplicationStatus.SUBMITTED,
            newStatus: ApplicationStatus.APPROVED,
          }),
        }),
        expect.anything(),
      );
    });

    it('should successfully reject an application with mandatory note and set status to REJECTED', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ ...assignedApp });

      const result = await service.recordDecision(
        'app-123',
        {
          decision: ReviewerDecision.REJECT,
          note: 'High-risk business type in unsupported jurisdiction',
        },
        reviewerUser,
      );

      expect(result.status).toBe(ApplicationStatus.REJECTED);
      expect(result.decisionNote).toBe(
        'High-risk business type in unsupported jurisdiction',
      );
      expect(result.decidedAt).toBeInstanceOf(Date);
    });

    it('should successfully request info with mandatory note and set status to INFO_REQUESTED without decidedAt', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ ...assignedApp });

      const result = await service.recordDecision(
        'app-123',
        {
          decision: ReviewerDecision.REQUEST_INFO,
          note: 'Please provide updated utility bill for proof of address',
        },
        reviewerUser,
      );

      expect(result.status).toBe(ApplicationStatus.INFO_REQUESTED);
      expect(result.decisionNote).toBe(
        'Please provide updated utility bill for proof of address',
      );
      expect(result.decidedAt).toBeNull();
    });

    it('should strictly throw ConflictException (409) when riskStatus is PENDING (State Gating Invariant)', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...assignedApp,
        riskStatus: RiskStatus.PENDING,
      });

      await expect(
        service.recordDecision(
          'app-123',
          { decision: ReviewerDecision.APPROVE },
          reviewerUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException (409) when application is not in SUBMITTED status', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({
        ...assignedApp,
        status: ApplicationStatus.DRAFT,
      });

      await expect(
        service.recordDecision(
          'app-123',
          { decision: ReviewerDecision.APPROVE },
          reviewerUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException (404) when application is not found or not assigned to calling reviewer', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await expect(
        service.recordDecision(
          'app-123',
          { decision: ReviewerDecision.APPROVE },
          reviewerUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException (403) when non-reviewer attempts to record a decision', async () => {
      await expect(
        service.recordDecision(
          'app-123',
          { decision: ReviewerDecision.APPROVE },
          salesUser,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.recordDecision(
          'app-123',
          { decision: ReviewerDecision.APPROVE },
          adminUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException (400) when REJECT decision is missing explanatory note', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ ...assignedApp });

      await expect(
        service.recordDecision(
          'app-123',
          { decision: ReviewerDecision.REJECT, note: 'tiny' },
          reviewerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException (400) when REQUEST_INFO decision is missing explanatory note', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ ...assignedApp });

      await expect(
        service.recordDecision(
          'app-123',
          { decision: ReviewerDecision.REQUEST_INFO, note: '' },
          reviewerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
