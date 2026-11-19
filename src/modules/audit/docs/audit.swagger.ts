import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

/**
 * Controller-level Swagger documentation for Audit module.
 */
export function ApiAuditDocs() {
  return applyDecorators(ApiTags('Audit'));
}

/**
 * Endpoint-level Swagger documentation for GET /audit-logs.
 */
export function ApiFindAllAuditLogsDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Retrieve compliance audit trail with pagination and filters',
    }),
    ApiResponse({
      status: 200,
      description: 'Paginated audit trail records',
    }),
  );
}
