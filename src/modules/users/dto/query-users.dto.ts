import { IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '../enums/user-role.enum';

/**
 * Query parameters for filtering the user directory by role.
 */
export class QueryUsersDto {
  /**
   * Optional system role filter (e.g. REVIEWER, SALES, ADMIN)
   * @example "REVIEWER"
   */
  @IsOptional()
  @IsEnum(UserRole, {
    message: `role must be one of: ${Object.values(UserRole).join(', ')}`,
  })
  role?: UserRole;
}
