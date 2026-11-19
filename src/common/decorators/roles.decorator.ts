import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../modules/users/enums/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * Decorator to attach required UserRoles to route handlers or controllers.
 * Consumed by RolesGuard to enforce role-based access control.
 *
 * @example
 * @Roles(UserRole.ADMIN)
 * @Roles(UserRole.REVIEWER, UserRole.ADMIN)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
