import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';

describe('AuthService', () => {
  let service: AuthService;
  let passwordService: PasswordService;
  let jwtService: JwtService;

  const mockUser: Partial<User> = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'sales1@example.com',
    passwordHash: '$2b$10$hashedpasswordstring',
    role: UserRole.SALES,
  };

  const createQueryBuilder: any = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockUserRepository = {
    createQueryBuilder: jest.fn(() => createQueryBuilder),
  };

  const mockPasswordService = {
    compare: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mocked.jwt.token'),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'jwt.expiresIn') return '24h';
      if (key === 'jwt.secret') return 'test-secret-key-at-least-16-chars';
      return null;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: PasswordService,
          useValue: mockPasswordService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    passwordService = module.get<PasswordService>(PasswordService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should successfully authenticate and return accessToken and user profile', async () => {
      createQueryBuilder.getOne.mockResolvedValueOnce(mockUser);
      mockPasswordService.compare.mockResolvedValueOnce(true);

      const result = await service.login({
        email: 'sales1@example.com',
        password: 'Password123!',
      });

      expect(result).toEqual({
        accessToken: 'mocked.jwt.token',
        expiresIn: '24h',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
        },
      });
      expect(mockPasswordService.compare).toHaveBeenCalledWith(
        'Password123!',
        mockUser.passwordHash,
      );
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
    });

    it('should normalize email to lowercase and trim spaces', async () => {
      createQueryBuilder.getOne.mockResolvedValueOnce(mockUser);
      mockPasswordService.compare.mockResolvedValueOnce(true);

      await service.login({
        email: '  Sales1@Example.COM  ',
        password: 'Password123!',
      });

      expect(createQueryBuilder.where).toHaveBeenCalledWith(
        'user.email = :email',
        { email: 'sales1@example.com' },
      );
    });

    it('should throw 401 Unauthorized if user is not found', async () => {
      createQueryBuilder.getOne.mockResolvedValueOnce(null);

      await expect(
        service.login({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

      expect(mockPasswordService.compare).not.toHaveBeenCalled();
    });

    it('should throw 401 Unauthorized if password does not match', async () => {
      createQueryBuilder.getOne.mockResolvedValueOnce(mockUser);
      mockPasswordService.compare.mockResolvedValueOnce(false);

      await expect(
        service.login({
          email: 'sales1@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    });
  });
});
