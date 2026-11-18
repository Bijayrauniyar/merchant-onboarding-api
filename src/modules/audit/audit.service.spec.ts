import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';

describe('AuditService', () => {
  let service: AuditService;
  let repository: jest.Mocked<Repository<AuditLog>>;

  const mockRepository = {
    save: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    repository = module.get(getRepositoryToken(AuditLog));
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    it('should scrub PII and credentials from metadata before saving', async () => {
      const dto: CreateAuditLogDto = {
        entityName: 'MerchantApplication',
        entityId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        action: 'APPLICATION_CREATED',
        actorId: 'user-uuid-1234',
        actorRole: 'SALES',
        metadata: {
          businessName: 'Acme LLC',
          ownerEmail: 'john.doe@example.com',
          ownerPhone: '+1-555-123-4567',
          password: 'secret_password_do_not_log',
          apiKey: 'key_live_abcdef',
        },
      };

      repository.save.mockImplementation(async (entry: any) => ({
        ...entry,
        id: 'audit-log-uuid',
        createdAt: new Date(),
      }));

      const result = await service.log(dto);

      expect(repository.save).toHaveBeenCalledTimes(1);
      const savedEntry = repository.save.mock.calls[0][0];

      // Verifications:
      expect(savedEntry.entityName).toBe(dto.entityName);
      expect(savedEntry.entityId).toBe(dto.entityId);
      expect(savedEntry.action).toBe(dto.action);
      expect(savedEntry.actorId).toBe(dto.actorId);
      expect(savedEntry.actorRole).toBe(dto.actorRole);

      // PII scrubbed:
      expect(savedEntry.metadata!.ownerEmail).toBe('j***e@example.com');
      expect(savedEntry.metadata!.ownerPhone).toBe('***-***-4567');
      expect(savedEntry.metadata!.password).toBe('[REDACTED]');
      expect(savedEntry.metadata!.apiKey).toBe('[REDACTED]');
      expect(savedEntry.metadata!.businessName).toBe('Acme LLC');

      expect(result.id).toBe('audit-log-uuid');
    });

    it('should participate in external transaction when EntityManager is provided', async () => {
      const dto: CreateAuditLogDto = {
        entityName: 'MerchantApplication',
        entityId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        action: 'STATUS_TRANSITION',
        actorId: 'reviewer-uuid',
        actorRole: 'REVIEWER',
        metadata: { from: 'SUBMITTED', to: 'APPROVED' },
      };

      const mockEntityManager = {
        save: jest.fn().mockImplementation(async (entityClass, entry) => ({
          ...entry,
          id: 'trans-audit-uuid',
          createdAt: new Date(),
        })),
      } as unknown as EntityManager;

      const result = await service.log(dto, mockEntityManager);

      // Repository.save should NOT be called; EntityManager.save should be called instead
      expect(repository.save).not.toHaveBeenCalled();
      expect(mockEntityManager.save).toHaveBeenCalledTimes(1);
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          action: 'STATUS_TRANSITION',
          metadata: { from: 'SUBMITTED', to: 'APPROVED' },
        }),
      );
      expect(result.id).toBe('trans-audit-uuid');
    });
  });

  describe('findByEntity', () => {
    it('should query repository by entityName and entityId ordered by createdAt DESC', async () => {
      const mockHistory = [
        { id: '1', action: 'STATUS_TRANSITION' },
        { id: '2', action: 'APPLICATION_CREATED' },
      ] as AuditLog[];

      repository.find.mockResolvedValue(mockHistory);

      const result = await service.findByEntity(
        'MerchantApplication',
        'app-uuid-123',
      );

      expect(repository.find).toHaveBeenCalledWith({
        where: {
          entityName: 'MerchantApplication',
          entityId: 'app-uuid-123',
        },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(mockHistory);
    });
  });

  describe('findAll', () => {
    it('should return paginated audit logs', async () => {
      const mockLogs = [{ id: '1' }, { id: '2' }] as AuditLog[];
      repository.findAndCount.mockResolvedValue([mockLogs, 2]);

      const result = await service.findAll({ limit: 10, offset: 20 });

      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: undefined,
        order: { createdAt: 'DESC' },
        take: 10,
        skip: 20,
      });
      expect(result).toEqual({ data: mockLogs, total: 2 });
    });

    it('should apply entity filters when provided', async () => {
      const mockLogs = [{ id: '1' }] as AuditLog[];
      repository.findAndCount.mockResolvedValue([mockLogs, 1]);

      const result = await service.findAll({
        limit: 10,
        offset: 0,
        entityName: 'MerchantApplication',
        entityId: 'uuid-1234',
      });

      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: {
          entityName: 'MerchantApplication',
          entityId: 'uuid-1234',
        },
        order: { createdAt: 'DESC' },
        take: 10,
        skip: 0,
      });
      expect(result).toEqual({ data: mockLogs, total: 1 });
    });
  });
});
