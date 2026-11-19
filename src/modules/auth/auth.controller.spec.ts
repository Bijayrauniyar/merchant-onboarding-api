import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserRole } from '../users/enums/user-role.enum';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockLoginResponse = {
    accessToken: 'mocked.jwt.token',
    expiresIn: '24h',
    user: {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'sales1@example.com',
      role: UserRole.SALES,
    },
  };

  const mockAuthService = {
    login: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should forward credentials to AuthService.login and return result', async () => {
      mockAuthService.login.mockResolvedValueOnce(mockLoginResponse);

      const loginDto = {
        email: 'sales1@example.com',
        password: 'Password123!',
      };

      const result = await controller.login(loginDto);
      expect(result).toBe(mockLoginResponse);
      expect(authService.login).toHaveBeenCalledWith(loginDto);
    });
  });
});
