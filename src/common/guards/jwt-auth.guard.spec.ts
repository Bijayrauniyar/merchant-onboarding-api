import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('handleRequest', () => {
    it('should return user when authentication succeeds', () => {
      const user = { id: '123e4567-e89b-12d3-a456-426614174000', email: 'sales1@example.com' };
      const result = guard.handleRequest(null, user, null, {} as any);
      expect(result).toBe(user);
    });

    it('should throw UnauthorizedException when user is null', () => {
      expect(() => guard.handleRequest(null, null, null, {} as any)).toThrow(
        new UnauthorizedException('Authentication required'),
      );
    });

    it('should propagate existing error when error is provided', () => {
      const customError = new Error('Token expired');
      expect(() => guard.handleRequest(customError, null, null, {} as any)).toThrow(
        customError,
      );
    });
  });
});
