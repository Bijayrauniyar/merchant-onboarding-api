import { UserRole } from '../../users/enums/user-role.enum';

export class AuthUserDto {
  /**
   * Unique user identifier
   * @example 123e4567-e89b-12d3-a456-426614174000
   */
  id!: string;

  /**
   * User email address
   * @example sales1@example.com
   */
  email!: string;

  /**
   * Assigned system role
   * @example SALES
   */
  role!: UserRole;
}

export class LoginResponseDto {
  /**
   * Signed JSON Web Token (Bearer)
   * @example eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   */
  accessToken!: string;

  /**
   * Token expiration duration
   * @example 24h
   */
  expiresIn!: string;

  /**
   * Authenticated user profile
   */
  user!: AuthUserDto;
}
