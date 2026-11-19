import { UserRole } from '../../modules/users/enums/user-role.enum';

/**
 * Normalized user context extracted from validated JWT access tokens.
 * Injected into request handlers via the `@CurrentUser()` decorator.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}
