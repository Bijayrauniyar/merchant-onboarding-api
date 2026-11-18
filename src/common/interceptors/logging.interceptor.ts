import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const method = request.method;
    const url = request.originalUrl || request.url;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = response.statusCode;
          const duration = Date.now() - startTime;
          this.logger.log(`${method} ${url} ${statusCode} +${duration}ms`);
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode =
            typeof error.getStatus === 'function'
              ? error.getStatus()
              : error.status || error.statusCode || 500;
          this.logger.warn(
            `${method} ${url} ${statusCode} +${duration}ms [Error: ${error.message || 'Unknown'}]`,
          );
        },
      }),
    );
  }
}
