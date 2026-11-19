import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
      description: 'Validates user email and password, issuing a signed JWT Bearer token.',
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
