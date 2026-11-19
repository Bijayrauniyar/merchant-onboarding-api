import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { UserRole } from '../../users/enums/user-role.enum';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'jwt.secret') return 'test-jwt-secret-at-least-16-chars';
      return null;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    strategy = new JwtStrategy(mockConfigService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should unpack payload and return authenticated user object', async () => {
      const payload: JwtPayload = {
        sub: '123e4567-e89b-12d3-a456-426614174000',
        email: 'reviewer1@example.com',
        role: UserRole.REVIEWER,
      };

      const result = await strategy.validate(payload);
      expect(result).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'reviewer1@example.com',
        role: UserRole.REVIEWER,
      });
    });

    it('should throw UnauthorizedException if sub is missing', async () => {
      const invalidPayload = {
        email: 'reviewer1@example.com',
        role: UserRole.REVIEWER,
      } as JwtPayload;

      await expect(strategy.validate(invalidPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if role is missing', async () => {
      const invalidPayload = {
        sub: '123e4567-e89b-12d3-a456-426614174000',
        email: 'reviewer1@example.com',
      } as JwtPayload;

      await expect(strategy.validate(invalidPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
