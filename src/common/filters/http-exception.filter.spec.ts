import { ArgumentsHost, HttpException, HttpStatus, NotFoundException, BadRequestException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: {
    status: jest.Mock;
    json: jest.Mock;
  };
  let mockRequest: {
    method: string;
    url: string;
  };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockRequest = {
      method: 'GET',
      url: '/test-endpoint',
    };
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should format standard HttpException into uniform response', () => {
    const exception = new NotFoundException('Resource not found');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        path: '/test-endpoint',
        message: 'Resource not found',
        error: 'Not Found',
      }),
    );
  });

  it('should handle validation errors with multiple validation messages', () => {
    const validationErrors = ['email must be an email', 'password is too short'];
    const exception = new BadRequestException({
      statusCode: 400,
      message: validationErrors,
      error: 'Bad Request',
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        path: '/test-endpoint',
        message: validationErrors,
        error: 'Bad Request',
      }),
    );
  });

  it('should sanitize raw unhandled errors to 500 without leaking stack traces or internal details', () => {
    const rawError = new Error('FATAL: password authentication failed for user postgres');

    filter.catch(rawError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        path: '/test-endpoint',
        message: 'Internal server error',
        error: 'Internal Server Error',
      }),
    );
    // Verify internal message is completely sanitized
    const responsePayload = mockResponse.json.mock.calls[0][0];
    expect(responsePayload.message).not.toContain('password');
    expect(responsePayload.message).not.toContain('postgres');
    expect(responsePayload).not.toHaveProperty('stack');
  });
});
