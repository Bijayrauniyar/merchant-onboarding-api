import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuditLog } from '../entities/audit-log.entity';

/**
 * Controller-level Swagger documentation for Audit module.
 */
export function ApiAuditDocs() {
  return applyDecorators(ApiTags('Audit'), ApiBearerAuth());
}

/**
 * Endpoint-level Swagger documentation for GET /audit-logs.
 */
export function ApiFindAllAuditLogsDoc() {
  return applyDecorators(
    ApiOperation({
      summary:
        'Retrieve compliance audit trail with pagination and filters (ADMIN only)',
    }),
    ApiResponse({
      status: 200,
      description: 'Paginated audit trail records',
      type: [AuditLog],
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized: Missing or invalid JWT access token',
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden: Requires ADMIN role',
    }),
  );
}
