import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

/**
 * Controller-level Swagger documentation for Health module.
 */
export function ApiHealthDocs() {
  return applyDecorators(ApiTags('Health'));
}

/**
 * Endpoint-level Swagger documentation for GET /health.
 */
export function ApiHealthCheckDoc() {
  return applyDecorators(
    ApiOperation({ summary: 'System health, liveness and readiness probe' }),
    ApiResponse({
      status: 200,
      description: 'Service is healthy',
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          timestamp: { type: 'string', example: '2026-11-18T15:00:00.000Z' },
          uptime: { type: 'number', example: 12.34 },
        },
      },
    }),
  );
}
