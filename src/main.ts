import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { formatValidationErrors } from './common/utils/validation-error-formatter.util';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Correlation ID Middleware for end-to-end distributed request tracing
  app.use((req: any, res: any, next: any) => {
    const correlationId = req.headers['x-request-id'] || randomUUID();
    req.headers['x-request-id'] = correlationId;
    res.setHeader('X-Request-Id', correlationId);
    next();
  });

  // HTTP Security Headers via Helmet (with Swagger UI CSP compatibility)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          styleSrc: [`'self'`, `'unsafe-inline'`],
          imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
          scriptSrc: [`'self'`, `https: 'unsafe-inline'`],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Strict Request Body Payload Limits (Anti-DoS)
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));

  // Enable standard CORS
  app.enableCors();

  // Enable graceful shutdown hooks for clean process termination
  app.enableShutdownHooks();

  // Global exception filter for centralized error handling and sanitization
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global logging interceptor for latency and HTTP access logging
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Global validation pipe with strict whitelist enforcement (Anti-Mass Assignment) and clean structured errors
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (validationErrors = []) => {
        const { messages, errors } = formatValidationErrors(validationErrors);
        return new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: messages,
          errors,
        });
      },
    }),
  );

  // OpenAPI / Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Merchant Onboarding & Risk Review API')
    .setDescription(
      `Enterprise API for merchant onboarding with asynchronous risk review (BullMQ), role-based access control, and query-level authorization.

**Test Personas** (\`Password123!\`): \`sales1@example.com\` (SALES) | \`reviewer1@example.com\` (REVIEWER) | \`admin@example.com\` (ADMIN)

**Underwriting Scenarios** (Select from endpoint **Examples dropdown**):
- **PASS**: Clean merchant (\`Apex Coffee Roasters\`) → Evaluates to score 85, \`riskStatus: PASSED\`
- **FLAG**: High-risk merchant (\`Risky High-Roller Gaming Lounge\`) → Evaluates to score 45, \`riskStatus: FLAGGED\`
- **FAIL**: Outage merchant (\`FailSafe Global Logistics\`) → Simulates vendor timeout, retries exhaust, \`riskStatus: FAILED\``,
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT Bearer token',
        in: 'header',
      },
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('port', 3000);

  await app.listen(port);
  logger.log(`Application running on: http://localhost:${port}`);
  logger.log(`Swagger documentation available at: http://localhost:${port}/api/docs`);
  logger.log(`Health check ready at: http://localhost:${port}/health`);
}

bootstrap();
