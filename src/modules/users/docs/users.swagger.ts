import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '../enums/user-role.enum';
import { UserResponseDto } from '../dto/user-response.dto';

/**
 * Controller-level Swagger documentation for Users module.
 */
export function ApiUsersDocs() {
  return applyDecorators(ApiTags('Users'), ApiBearerAuth());
}

/**
 * Endpoint-level Swagger documentation for GET /users.
 */
export function ApiFindAllUsersDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'List users with optional role filtering',
      description:
        'Restricted to ADMIN role. Enables dynamic population of reviewer dropdowns during assignment. Strictly excludes credentials (passwordHash).',
    }),
    ApiQuery({
      name: 'role',
      enum: UserRole,
      required: false,
      description: 'Filter users by system role (e.g. REVIEWER, SALES, ADMIN)',
    }),
    ApiResponse({
      status: 200,
      description: 'List of users matching role filter (without passwordHash)',
      type: [UserResponseDto],
    }),
    ApiResponse({
      status: 400,
      description: 'Bad Request: Invalid role query parameter',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized: Missing or invalid JWT access token',
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden: Caller lacks ADMIN role',
    }),
  );
}
