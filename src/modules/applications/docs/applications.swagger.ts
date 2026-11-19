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

/**
 * Endpoint-level Swagger documentation for POST /applications/:id/submit.
 */
export function ApiSubmitApplicationDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Submit merchant application for risk review',
      description:
        'Transitions application from DRAFT or INFO_REQUESTED to SUBMITTED. Increments submissionVersion and marks riskStatus as PENDING. Scoped by ownership for SALES.',
    }),
    ApiParam({
      name: 'id',
      type: 'string',
      format: 'uuid',
      description: 'Unique application identifier (UUID v4)',
    }),
    ApiResponse({
      status: 200,
      description: 'Application successfully submitted for review',
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
    ApiResponse({
      status: 409,
      description:
        'Conflict: Application cannot be submitted in current lifecycle status',
    }),
    ApiResponse({
      status: 503,
      description:
        'Service Unavailable: Background risk queue is temporarily unavailable. Application submitted and marked FAILED for manual review.',
    }),
  );
}

/**
 * Endpoint-level Swagger documentation for POST /applications/:id/assign.
 */
export function ApiAssignReviewerDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Assign a reviewer to a submitted application',
      description:
        'Restricted to ADMIN role. Requires application to be in SUBMITTED status and target user to hold REVIEWER role.',
    }),
    ApiParam({
      name: 'id',
      type: 'string',
      format: 'uuid',
      description: 'Unique application identifier (UUID v4)',
    }),
    ApiResponse({
      status: 200,
      description: 'Reviewer successfully assigned to application',
      type: MerchantApplication,
    }),
    ApiResponse({
      status: 400,
      description:
        'Bad Request: Target user not found or does not hold REVIEWER role',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized: Missing or invalid JWT access token',
    }),
    ApiResponse({
      status: 403,
      description:
        'Forbidden: Caller lacks ADMIN role required for reviewer assignment',
    }),
    ApiResponse({
      status: 404,
      description: 'Not Found: Application not found',
    }),
    ApiResponse({
      status: 409,
      description:
        'Conflict: Application must be in SUBMITTED status to assign a reviewer',
    }),
  );
}

/**
 * Endpoint-level Swagger documentation for POST /applications/:id/decision.
 */
export function ApiRecordDecisionDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Record official reviewer decision on an assigned application',
      description:
        'Restricted to the assigned REVIEWER. Decisions: APPROVE, REJECT (mandatory note), REQUEST_INFO (mandatory note). Strictly blocked with 409 Conflict if automated risk check is PENDING.',
    }),
    ApiParam({
      name: 'id',
      type: 'string',
      format: 'uuid',
      description: 'Unique application identifier (UUID v4)',
    }),
    ApiResponse({
      status: 200,
      description: 'Reviewer decision successfully recorded and applied',
      type: MerchantApplication,
    }),
    ApiResponse({
      status: 400,
      description:
        'Bad Request: Note is mandatory for REJECT and REQUEST_INFO decisions',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized: Missing or invalid JWT access token',
    }),
    ApiResponse({
      status: 403,
      description:
        'Forbidden: Caller role cannot record reviewer decisions (SALES and ADMIN barred)',
    }),
    ApiResponse({
      status: 404,
      description:
        'Not Found: Application not found or not assigned to the calling reviewer',
    }),
    ApiResponse({
      status: 409,
      description:
        'Conflict: Automated risk check is PENDING or application not in SUBMITTED status',
    }),
  );
}
