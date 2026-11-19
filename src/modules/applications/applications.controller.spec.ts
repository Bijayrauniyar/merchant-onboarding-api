import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { QueryApplicationsDto } from './dto/query-applications.dto';
import { ApplicationStatus } from './enums/application-status.enum';
import { RiskStatus } from './enums/risk-status.enum';
import { BusinessType } from './enums/business-type.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { MerchantApplication } from './entities/merchant-application.entity';

describe('ApplicationsController', () => {
  let controller: ApplicationsController;
  let service: jest.Mocked<ApplicationsService>;

  const salesUser: AuthenticatedUser = {
    id: 'user-sales-1',
    email: 'sales1@example.com',
    role: UserRole.SALES,
  };

  const mockApp: MerchantApplication = {
    id: '123e4567-e89b-12d3-a456-426614174000',
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

  beforeEach(async () => {
    const mockService = {
      create: jest.fn().mockResolvedValue(mockApp),
      findAll: jest.fn().mockResolvedValue({
        data: [mockApp],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
      findOne: jest.fn().mockResolvedValue(mockApp),
      update: jest.fn().mockResolvedValue({
        ...mockApp,
        businessName: 'Acme Updated',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApplicationsController],
      providers: [
        {
          provide: ApplicationsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ApplicationsController>(ApplicationsController);
    service = module.get(ApplicationsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create()', () => {
    it('should delegate application creation to service with authenticated user', async () => {
      const dto: CreateApplicationDto = {
        businessName: 'Acme Coffee Roasters',
        legalBusinessName: 'Acme Coffee Roasters LLC',
        businessType: BusinessType.LLC,
        ownerName: 'Jane Doe',
        ownerEmail: 'jane@acmepayments.com',
        ownerPhone: '+14155552671',
        requestedMonthlyVolume: 50000.0,
        requestedAvgTicket: 125.5,
      };

      const result = await controller.create(dto, salesUser);

      expect(service.create).toHaveBeenCalledWith(dto, salesUser);
      expect(result).toEqual(mockApp);
    });
  });

  describe('findAll()', () => {
    it('should delegate paginated retrieval to service with query and user', async () => {
      const query: QueryApplicationsDto = { page: 1, limit: 20 };

      const result = await controller.findAll(salesUser, query);

      expect(service.findAll).toHaveBeenCalledWith(salesUser, query);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findOne()', () => {
    it('should delegate single application lookup to service with id and user', async () => {
      const appId = '123e4567-e89b-12d3-a456-426614174000';

      const result = await controller.findOne(appId, salesUser);

      expect(service.findOne).toHaveBeenCalledWith(appId, salesUser);
      expect(result).toEqual(mockApp);
    });
  });

  describe('update()', () => {
    it('should delegate application updates to service with id, dto, and user', async () => {
      const appId = '123e4567-e89b-12d3-a456-426614174000';
      const dto: UpdateApplicationDto = { businessName: 'Acme Updated' };

      const result = await controller.update(appId, dto, salesUser);

      expect(service.update).toHaveBeenCalledWith(appId, dto, salesUser);
      expect(result.businessName).toBe('Acme Updated');
    });
  });
});
