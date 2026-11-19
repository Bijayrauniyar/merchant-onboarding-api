import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../modules/users/enums/user-role.enum';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const createMockExecutionContext = (user?: any): ExecutionContext => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow access if no roles are defined on handler or class', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const context = createMockExecutionContext();
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access if required roles is an empty array', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);

      const context = createMockExecutionContext();
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when user role matches one of the required roles', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.ADMIN, UserRole.REVIEWER]);

      const context = createMockExecutionContext({
        id: '123e4567-e89b-12d3-a456-426614174000',
        role: UserRole.REVIEWER,
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw ForbiddenException if user has an insufficient role', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.ADMIN]);

      const context = createMockExecutionContext({
        id: '123e4567-e89b-12d3-a456-426614174000',
        role: UserRole.SALES,
      });

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException(
          'Access denied: insufficient permissions',
        ),
      );
    });

    it('should throw ForbiddenException if user is missing on request', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.ADMIN]);

      const context = createMockExecutionContext(undefined);

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException(
          'Forbidden resource: user identity or role missing',
        ),
      );
    });

    it('should throw ForbiddenException if user object has no role property', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.ADMIN]);

      const context = createMockExecutionContext({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException(
          'Forbidden resource: user identity or role missing',
        ),
      );
    });
  });
});
