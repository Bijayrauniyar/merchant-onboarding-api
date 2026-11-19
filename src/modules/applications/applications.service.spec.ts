import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { MerchantApplication } from './entities/merchant-application.entity';
import { AuditService } from '../audit/audit.service';
import { ApplicationStatus } from './enums/application-status.enum';
import { RiskStatus } from './enums/risk-status.enum';
import { BusinessType } from './enums/business-type.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let applicationRepository: jest.Mocked<Repository<MerchantApplication>>;
  let auditService: jest.Mocked<AuditService>;
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

    const mockAuditService = {
      log: jest.fn().mockResolvedValue({} as any),
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
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<ApplicationsService>(ApplicationsService);
    applicationRepository = module.get(getRepositoryToken(MerchantApplication));
    auditService = module.get(AuditService);
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
});
