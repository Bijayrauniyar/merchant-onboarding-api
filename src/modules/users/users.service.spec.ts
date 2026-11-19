import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';

describe('UsersService', () => {
  let service: UsersService;

  const mockUsers: Partial<User>[] = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'admin@fintech.local',
      passwordHash: '$2b$10$insecureMockHash1',
      role: UserRole.ADMIN,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'reviewer1@fintech.local',
      passwordHash: '$2b$10$insecureMockHash2',
      role: UserRole.REVIEWER,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      email: 'reviewer2@fintech.local',
      passwordHash: '$2b$10$insecureMockHash3',
      role: UserRole.REVIEWER,
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    },
  ];

  const mockUserRepository = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findAll', () => {
    it('should query without role filter when no role is specified', async () => {
      mockUserRepository.find.mockResolvedValue(mockUsers);

      const result = await service.findAll();

      expect(mockUserRepository.find).toHaveBeenCalledWith({
        where: {},
        order: { email: 'ASC' },
      });
      expect(result).toHaveLength(3);
      expect(result[0].email).toBe('admin@fintech.local');
      expect(result[1].email).toBe('reviewer1@fintech.local');
      expect(result[2].email).toBe('reviewer2@fintech.local');
    });

    it('should query with role filter when role is provided', async () => {
      const reviewerUsers = mockUsers.filter(
        (u) => u.role === UserRole.REVIEWER,
      );
      mockUserRepository.find.mockResolvedValue(reviewerUsers);

      const result = await service.findAll(UserRole.REVIEWER);

      expect(mockUserRepository.find).toHaveBeenCalledWith({
        where: { role: UserRole.REVIEWER },
        order: { email: 'ASC' },
      });
      expect(result).toHaveLength(2);
      expect(result.every((u) => u.role === UserRole.REVIEWER)).toBe(true);
    });

    it('should return an empty array when no users match criteria', async () => {
      mockUserRepository.find.mockResolvedValue([]);

      const result = await service.findAll(UserRole.SALES);

      expect(mockUserRepository.find).toHaveBeenCalledWith({
        where: { role: UserRole.SALES },
        order: { email: 'ASC' },
      });
      expect(result).toEqual([]);
    });

    it('should strictly exclude passwordHash from all returned user DTO objects', async () => {
      mockUserRepository.find.mockResolvedValue(mockUsers);

      const result = await service.findAll();

      for (const user of result) {
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('email');
        expect(user).toHaveProperty('role');
        expect(user).toHaveProperty('createdAt');
        expect((user as any).passwordHash).toBeUndefined();
      }
    });
  });
});
