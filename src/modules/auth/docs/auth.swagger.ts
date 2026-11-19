import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LoginDto } from '../dto/login.dto';
import { LoginResponseDto } from '../dto/login-response.dto';

/**
 * Controller-level Swagger documentation for Authentication module.
 */
export function ApiAuthDocs() {
  return applyDecorators(ApiTags('Authentication'));
}

/**
 * Endpoint-level Swagger documentation for POST /auth/login.
 */
export function ApiLoginDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Authenticate user credentials',
      description:
        'Validates user email and password, issuing a signed JWT Bearer token. Use the Examples dropdown below to select any seeded test persona.',
    }),
    ApiBody({
      type: LoginDto,
      description: 'Select a seeded persona from the dropdown to authenticate:',
      examples: {
        salesAccount: {
          summary: '1. SALES Persona (sales1@example.com)',
          description:
            'SALES user: Can create, edit, list, and submit own applications (enforces anti-IDOR scoping).',
          value: {
            email: 'sales1@example.com',
            password: 'Password123!',
          },
        },
        reviewerAccount: {
          summary: '2. REVIEWER Persona (reviewer1@example.com)',
          description:
            'REVIEWER user: Can view assigned applications and record decisions (APPROVE, REJECT, REQUEST_INFO).',
          value: {
            email: 'reviewer1@example.com',
            password: 'Password123!',
          },
        },
        adminAccount: {
          summary: '3. ADMIN Persona (admin@example.com)',
          description:
            'ADMIN user: Full operational access, assigns reviewers, views all applications and audit logs.',
          value: {
            email: 'admin@example.com',
            password: 'Password123!',
          },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Authentication successful. Returns JWT access token and user profile.',
      type: LoginResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Bad Request. Validation failed for email or password.',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized. Invalid email or password.',
    }),
  );
}
