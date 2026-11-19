import { UserRole } from '../enums/user-role.enum';

/**
 * Public user profile response representation safe for client consumption.
 * Strictly excludes sensitive credential attributes (`passwordHash`).
 */
export class UserResponseDto {
  /**
   * Unique user identifier (UUID v4)
   * @example "123e4567-e89b-12d3-a456-426614174000"
   */
  id!: string;

  /**
   * Unique corporate email address
   * @example "reviewer1@fintech.local"
   */
  email!: string;

  /**
   * Assigned system role
   * @example "REVIEWER"
   */
  role!: UserRole;

  /**
   * Account creation timestamp
   * @example "2026-03-01T10:00:00.000Z"
   */
  createdAt!: Date;
}
