import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
} from '@nestjs/swagger';
import { MerchantApplication } from '../entities/merchant-application.entity';
import { PaginatedApplicationsResponseDto } from '../dto/paginated-applications-response.dto';

/**
 * Controller-level Swagger documentation for Applications module.
 */
export function ApiApplicationsDocs() {
  return applyDecorators(ApiTags('Applications'), ApiBearerAuth());
}

/**
 * Endpoint-level Swagger documentation for POST /applications.
 */
export function ApiCreateApplicationDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a new merchant onboarding application',
      description:
        'Initializes an application in DRAFT state assigned to the calling user (SALES or ADMIN).',
    }),
    ApiResponse({
      status: 201,
      description: 'Application successfully created in DRAFT status',
      type: MerchantApplication,
    }),
    ApiResponse({
      status: 400,
      description: 'Bad Request: Validation failed on input payload',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized: Missing or invalid JWT access token',
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden: Caller role cannot create applications (REVIEWER barred)',
    }),
  );
}

/**
 * Endpoint-level Swagger documentation for GET /applications.
 */
export function ApiFindAllApplicationsDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Retrieve paginated applications scoped to authenticated caller',
      description:
        'Enforces Tier-2 authorization: SALES sees only their own applications, REVIEWER sees only assigned applications, ADMIN sees all applications.',
    }),
    ApiResponse({
      status: 200,
      description: 'Paginated merchant applications matching caller scope and filters',
      type: PaginatedApplicationsResponseDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized: Missing or invalid JWT access token',
    }),
  );
}

/**
 * Endpoint-level Swagger documentation for GET /applications/:id.
 */
export function ApiFindOneApplicationDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Retrieve application details by ID',
      description:
        'Enforces Anti-Enumeration: returns 404 Not Found if the record does not exist OR is outside caller scope.',
    }),
    ApiParam({
      name: 'id',
      type: 'string',
      format: 'uuid',
      description: 'Unique application identifier (UUID v4)',
    }),
    ApiResponse({
      status: 200,
      description: 'Application found and returned',
      type: MerchantApplication,
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized: Missing or invalid JWT access token',
    }),
    ApiResponse({
      status: 404,
      description:
        'Not Found: Application not found or caller lacks ownership scope (Anti-Enumeration)',
    }),
  );
}

/**
 * Endpoint-level Swagger documentation for PATCH /applications/:id.
 */
export function ApiUpdateApplicationDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Update application fields (editable only in DRAFT or INFO_REQUESTED)',
      description:
        'Permits updates to editable applications. Scoped by ownership for SALES. Returns 409 Conflict if application is locked for review.',
    }),
    ApiParam({
      name: 'id',
      type: 'string',
      format: 'uuid',
      description: 'Unique application identifier (UUID v4)',
    }),
    ApiResponse({
      status: 200,
      description: 'Application successfully updated',
      type: MerchantApplication,
    }),
    ApiResponse({
      status: 400,
      description: 'Bad Request: Validation failed or empty update',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized: Missing or invalid JWT access token',
    }),
    ApiResponse({
      status: 404,
      description:
        'Not Found: Application not found or caller lacks ownership scope (Anti-Enumeration)',
    }),
    ApiResponse({
      status: 409,
      description:
        'Conflict: Application is locked for updates (status is SUBMITTED, APPROVED, or REJECTED)',
    }),
  );
}
