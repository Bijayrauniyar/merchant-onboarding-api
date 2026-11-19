import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Job } from 'bullmq';
import { RiskProcessor } from './risk.processor';
import { RiskReview } from './entities/risk-review.entity';
import { MerchantApplication } from '../applications/entities/merchant-application.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { RiskStatus } from '../applications/enums/risk-status.enum';
import { RiskResult } from './enums/risk-result.enum';
import { SimulatedKybProvider } from './providers/simulated-kyb.provider';
import { AuditService } from '../audit/audit.service';
import { RiskJobData } from './risk.producer';

describe('RiskProcessor', () => {
  let processor: RiskProcessor;
  let applicationRepository: jest.Mocked<Partial<Repository<MerchantApplication>>>;
  let riskReviewRepository: jest.Mocked<Partial<Repository<RiskReview>>>;
  let kybProvider: jest.Mocked<Partial<SimulatedKybProvider>>;
  let auditService: jest.Mocked<Partial<AuditService>>;
  let dataSource: any;

  const mockApp: Partial<MerchantApplication> = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    businessName: 'Acme Coffee Roasters',
    status: ApplicationStatus.SUBMITTED,
    riskStatus: RiskStatus.PENDING,
    submissionVersion: 1,
  };

  const mockJob = {
    id: 'risk:123e4567-e89b-12d3-a456-426614174000:1',
    data: {
      applicationId: '123e4567-e89b-12d3-a456-426614174000',
      submissionVersion: 1,
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
  } as unknown as Job<RiskJobData>;

  beforeEach(async () => {
    applicationRepository = {
      findOne: jest.fn().mockResolvedValue({ ...mockApp }),
    };

    riskReviewRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    kybProvider = {
      evaluateBusiness: jest.fn().mockResolvedValue({
        result: RiskResult.PASSED,
        score: 85,
        rawResponse: { provider: 'SIMULATED_KYB', status: 'PASSED' },
      }),
    };

    auditService = {
      log: jest.fn().mockResolvedValue({} as any),
    };

    dataSource = {
      transaction: jest.fn(async (cb: (manager: any) => Promise<any>) => {
        const mockManager = {
          create: jest.fn((_, entity) => entity),
          save: jest.fn(async (_, entity) => entity),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
        };
        return cb(mockManager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskProcessor,
        {
          provide: getRepositoryToken(MerchantApplication),
          useValue: applicationRepository,
        },
        {
          provide: getRepositoryToken(RiskReview),
          useValue: riskReviewRepository,
        },
        {
          provide: SimulatedKybProvider,
          useValue: kybProvider,
        },
        {
          provide: AuditService,
          useValue: auditService,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    processor = module.get<RiskProcessor>(RiskProcessor);
  });

  describe('process() - Successful Evaluations', () => {
    it('should complete risk check, transition riskStatus to PASSED, persist review and write audit log', async () => {
      await processor.process(mockJob);

      expect(kybProvider.evaluateBusiness).toHaveBeenCalledWith('Acme Coffee Roasters');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RISK_REVIEW_COMPLETED',
          entityId: mockApp.id,
          actorId: 'system',
          actorRole: 'SYSTEM',
          metadata: expect.objectContaining({
            result: RiskResult.PASSED,
            score: 85,
            submissionVersion: 1,
          }),
        }),
        expect.anything(),
      );
    });

    it('should transition riskStatus to FLAGGED when provider returns FLAGGED', async () => {
      kybProvider.evaluateBusiness = jest.fn().mockResolvedValue({
        result: RiskResult.FLAGGED,
        score: 45,
        rawResponse: { provider: 'SIMULATED_KYB', status: 'FLAGGED' },
      });

      let updatedData: any;
      dataSource.transaction = jest.fn(async (cb: any) => {
        const mockManager = {
          create: jest.fn((_, entity) => entity),
          save: jest.fn(async (_, entity) => entity),
          update: jest.fn(async (entityClass, criteria, partialEntity) => {
            if (entityClass === MerchantApplication) updatedData = partialEntity;
            return { affected: 1 };
          }),
        };
        return cb(mockManager);
      });

      await processor.process(mockJob);

      expect(updatedData.riskStatus).toBe(RiskStatus.FLAGGED);
    });

    it('should skip inserting RiskReview or audit if guarded update in process() affects 0 rows', async () => {
      let savedRiskReview: any = null;
      dataSource.transaction = jest.fn(async (cb: any) => {
        const mockManager = {
          create: jest.fn((_, entity) => entity),
          save: jest.fn(async (entityClass, entity) => {
            if (entityClass === RiskReview) savedRiskReview = entity;
            return entity;
          }),
          update: jest.fn().mockResolvedValue({ affected: 0 }),
        };
        return cb(mockManager);
      });

      await processor.process(mockJob);

      expect(savedRiskReview).toBeNull();
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('process() - Idempotency Layer 3 (Worker Level)', () => {
    it('should skip execution when application is not found', async () => {
      applicationRepository.findOne = jest.fn().mockResolvedValue(null);

      await processor.process(mockJob);

      expect(kybProvider.evaluateBusiness).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should skip execution when application is not in SUBMITTED status', async () => {
      applicationRepository.findOne = jest.fn().mockResolvedValue({
        ...mockApp,
        status: ApplicationStatus.DRAFT,
      });

      await processor.process(mockJob);

      expect(kybProvider.evaluateBusiness).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should skip execution when job submissionVersion does not match application submissionVersion (stale job)', async () => {
      applicationRepository.findOne = jest.fn().mockResolvedValue({
        ...mockApp,
        submissionVersion: 2, // Application was already resubmitted to version 2
      });

      await processor.process(mockJob); // job has version 1

      expect(kybProvider.evaluateBusiness).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should skip execution when RiskReview record already exists for (applicationId, submissionVersion)', async () => {
      riskReviewRepository.findOne = jest.fn().mockResolvedValue({
        id: 'existing-review-uuid',
        applicationId: mockApp.id,
        submissionVersion: 1,
      } as any);

      await processor.process(mockJob);

      expect(kybProvider.evaluateBusiness).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('process() - Idempotency Layer 2 & Provider Errors', () => {
    it('should gracefully absorb PostgreSQL unique constraint collision (code 23505) without throwing', async () => {
      const uniqueCollisionError: any = new Error('duplicate key value violates unique constraint');
      uniqueCollisionError.code = '23505';

      dataSource.transaction = jest.fn().mockRejectedValue(uniqueCollisionError);

      await expect(processor.process(mockJob)).resolves.not.toThrow();
    });

    it('should re-throw downstream provider errors so BullMQ triggers retry backoff', async () => {
      kybProvider.evaluateBusiness = jest.fn().mockRejectedValue(new Error('KYB Provider Timeout'));

      await expect(processor.process(mockJob)).rejects.toThrow('KYB Provider Timeout');
    });
  });

  describe('onFailed() & handleFailureExhaustion()', () => {
    it('should transition application to FAILED and write audit log when retries are exhausted', async () => {
      const exhaustedJob = {
        ...mockJob,
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as unknown as Job<RiskJobData>;

      let updateCriteria: any;
      let updateValues: any;
      dataSource.transaction = jest.fn(async (cb: any) => {
        const mockManager = {
          update: jest.fn(async (entityClass, criteria, partialEntity) => {
            if (entityClass === MerchantApplication) {
              updateCriteria = criteria;
              updateValues = partialEntity;
            }
            return { affected: 1 };
          }),
        };
        return cb(mockManager);
      });

      await processor.onFailed(exhaustedJob, new Error('KYB Provider Timeout'));

      expect(updateCriteria).toEqual({
        id: mockApp.id,
        status: ApplicationStatus.SUBMITTED,
        riskStatus: RiskStatus.PENDING,
        submissionVersion: 1,
      });
      expect(updateValues).toEqual({
        riskStatus: RiskStatus.FAILED,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RISK_REVIEW_FAILED',
          entityId: mockApp.id,
          actorId: 'system',
          actorRole: 'SYSTEM',
          metadata: expect.objectContaining({
            reason: 'KYB Provider Timeout',
            attempts: 3,
            submissionVersion: 1,
          }),
        }),
        expect.anything(),
      );
    });

    it('should skip audit log in handleFailureExhaustion if guarded update affects 0 rows', async () => {
      const exhaustedJob = {
        ...mockJob,
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as unknown as Job<RiskJobData>;

      dataSource.transaction = jest.fn(async (cb: any) => {
        const mockManager = {
          update: jest.fn().mockResolvedValue({ affected: 0 }),
        };
        return cb(mockManager);
      });

      await processor.onFailed(exhaustedJob, new Error('KYB Provider Timeout'));

      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('should safely catch and log if handleFailureExhaustion throws inside onFailed()', async () => {
      const exhaustedJob = {
        ...mockJob,
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as unknown as Job<RiskJobData>;

      dataSource.transaction = jest.fn().mockRejectedValue(new Error('DB failure'));

      await expect(
        processor.onFailed(exhaustedJob, new Error('KYB Provider Timeout')),
      ).resolves.not.toThrow();
    });

    it('should not transition to FAILED if retry attempts have not been exhausted', async () => {
      const interimJob = {
        ...mockJob,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as unknown as Job<RiskJobData>;

      await processor.onFailed(interimJob, new Error('Temporary glitch'));

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should safely no-op in onFailed if job is undefined', async () => {
      await processor.onFailed(undefined, new Error('Unknown glitch'));
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });
});
