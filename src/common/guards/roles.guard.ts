import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../modules/users/enums/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Tier 1 Route-Level Role-Based Access Control Guard.
 *
 * Responsibilities:
 * 1. Resolves required roles from `@Roles(...)` metadata hierarchically (method overrides class).
 * 2. If no roles are declared on the endpoint, access is permitted by default.
 * 3. Inspects authenticated caller's role on `req.user` (populated by JwtStrategy).
 * 4. Fails closed with 403 Forbidden if user is unauthenticated or role privileges are insufficient.
 *    (Internal log records required roles; client response receives a generic message to prevent role enumeration).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles are defined on the handler or class, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      throw new ForbiddenException('Forbidden resource: user identity or role missing');
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      this.logger.warn(
        `Access denied for user '${user.id ?? 'unknown'}' with role '${user.role}'. Required roles: [${requiredRoles.join(', ')}]`,
      );
      throw new ForbiddenException('Access denied: insufficient permissions');
    }

    return true;
  }
}
