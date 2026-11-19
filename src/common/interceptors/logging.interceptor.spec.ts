import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;
  let mockRequest: { method: string; url: string; originalUrl: string };
  let mockResponse: { statusCode: number };

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
    mockRequest = {
      method: 'GET',
      url: '/health',
      originalUrl: '/health',
    };
    mockResponse = {
      statusCode: 200,
    };
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should intercept successful requests and pass through value', (done) => {
    mockCallHandler = {
      handle: () => of({ status: 'ok' }),
    };

    const observable = interceptor.intercept(mockExecutionContext, mockCallHandler);

    observable.subscribe({
      next: (val) => {
        expect(val).toEqual({ status: 'ok' });
      },
      complete: () => {
        done();
      },
    });
  });

  it('should include x-request-id in log prefix when header is present', (done) => {
    (mockRequest as any).headers = { 'x-request-id': 'req-12345' };
    mockCallHandler = {
      handle: () => of({ status: 'ok' }),
    };

    const observable = interceptor.intercept(mockExecutionContext, mockCallHandler);

    observable.subscribe({
      next: (val) => {
        expect(val).toEqual({ status: 'ok' });
      },
      complete: () => {
        done();
      },
    });
  });

  it('should intercept error responses and propagate the error', (done) => {
    const error = new Error('Database connection failed');
    mockCallHandler = {
      handle: () => throwError(() => error),
    };

    const observable = interceptor.intercept(mockExecutionContext, mockCallHandler);

    observable.subscribe({
      error: (err) => {
        expect(err).toBe(error);
        done();
      },
    });
  });
});
