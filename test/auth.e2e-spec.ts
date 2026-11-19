import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  Get,
  INestApplication,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { Roles } from '../src/common/decorators/roles.decorator';
import { CurrentUser } from '../src/common/decorators/current-user.decorator';
import { UserRole } from '../src/modules/users/enums/user-role.enum';

/**
 * Ephemeral test controller used exclusively within E2E testing to verify
 * route guard behavior, decorator extraction, and role enforcement.
 */
@Controller('test-protected')
class TestProtectedController {
  @Get('user')
  @UseGuards(JwtAuthGuard)
  getUser(@CurrentUser() user: any) {
    return { message: 'authenticated', user };
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminOnly() {
    return { message: 'admin access granted' };
  }
}

describe('Authentication & RBAC (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestProtectedController],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mirror production main.ts configuration exactly
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('should authenticate a seeded ADMIN account and issue a valid Bearer JWT', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'Password123!',
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.expiresIn).toBe('24h');
      expect(response.body.user).toEqual({
        id: expect.any(String),
        email: 'admin@example.com',
        role: UserRole.ADMIN,
      });
      // Security Invariant: Password hash must never leak in login responses
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });

    it('should authenticate a seeded REVIEWER account and return role REVIEWER', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'reviewer1@example.com',
          password: 'Password123!',
        })
        .expect(200);

      expect(response.body.user.email).toBe('reviewer1@example.com');
      expect(response.body.user.role).toBe(UserRole.REVIEWER);
    });

    it('should authenticate a seeded SALES account and return role SALES', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'sales1@example.com',
          password: 'Password123!',
        })
        .expect(200);

      expect(response.body.user.email).toBe('sales1@example.com');
      expect(response.body.user.role).toBe(UserRole.SALES);
    });

    it('should normalize mixed-case and whitespace-padded email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: '  Admin@Example.COM  ',
          password: 'Password123!',
        })
        .expect(200);

      expect(response.body.user.email).toBe('admin@example.com');
    });

    it('should return 401 Unauthorized for mismatched password', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'WrongPassword!',
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should return 401 Unauthorized for non-existent email (anti-enumeration)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent-user@example.com',
          password: 'Password123!',
        })
        .expect(401);

      // Anti-Enumeration: Error must be indistinguishable from wrong password
      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should reject login payloads with unwhitelisted properties (mass assignment protection)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'Password123!',
          role: 'ADMIN',
          isAdmin: true,
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          'property role should not exist',
          'property isAdmin should not exist',
        ]),
      );
    });

    it('should return 400 Bad Request when required fields are missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          'Must be a valid email address',
          'Password must be at least 8 characters long',
        ]),
      );
    });

    it('should return 400 Bad Request when email format is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'not-an-email',
          password: 'Password123!',
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining(['Must be a valid email address']),
      );
    });

    it('should return 400 Bad Request when password is under 8 characters', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'short',
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining(['Password must be at least 8 characters long']),
      );
    });
  });

  describe('Route Protection & RBAC Guards (Tier 1)', () => {
    let adminToken: string;
    let salesToken: string;

    beforeAll(async () => {
      const adminRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@example.com', password: 'Password123!' });
      adminToken = adminRes.body.accessToken;

      const salesRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'sales1@example.com', password: 'Password123!' });
      salesToken = salesRes.body.accessToken;
    });

    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      const response = await request(app.getHttpServer())
        .get('/test-protected/user')
        .expect(401);

      expect(response.body.message).toBe('Authentication required');
    });

    it('should reject non-Bearer authorization scheme with 401 Unauthorized', async () => {
      const response = await request(app.getHttpServer())
        .get('/test-protected/user')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .expect(401);

      expect(response.body.message).toBe('Authentication required');
    });

    it('should reject empty Bearer token with 401 Unauthorized', async () => {
      const response = await request(app.getHttpServer())
        .get('/test-protected/user')
        .set('Authorization', 'Bearer ')
        .expect(401);

      expect(response.body.message).toBe('Authentication required');
    });

    it('should reject invalid/forged Bearer token with 401 Unauthorized', async () => {
      const response = await request(app.getHttpServer())
        .get('/test-protected/user')
        .set('Authorization', 'Bearer invalid.bogus.token')
        .expect(401);

      expect(response.body.statusCode).toBe(401);
    });

    it('should reject cryptographically tampered JWT signature with 401 Unauthorized', async () => {
      const tamperedToken = adminToken.slice(0, -6) + 'xxxxxx';
      const response = await request(app.getHttpServer())
        .get('/test-protected/user')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);

      expect(response.body.message).toBe('Authentication required');
    });

    it('should permit authenticated request and inject user identity via @CurrentUser()', async () => {
      const response = await request(app.getHttpServer())
        .get('/test-protected/user')
        .set('Authorization', `Bearer ${salesToken}`)
        .expect(200);

      expect(response.body.message).toBe('authenticated');
      expect(response.body.user).toEqual({
        id: expect.any(String),
        email: 'sales1@example.com',
        role: UserRole.SALES,
      });
    });

    it('should allow ADMIN token to access an ADMIN-protected endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/test-protected/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.message).toBe('admin access granted');
    });

    it('should reject SALES token from accessing an ADMIN-protected endpoint with 403 Forbidden', async () => {
      const response = await request(app.getHttpServer())
        .get('/test-protected/admin')
        .set('Authorization', `Bearer ${salesToken}`)
        .expect(403);

      expect(response.body.statusCode).toBe(403);
      expect(response.body.message).toContain(
        'Access denied: requires one of the following roles: [ADMIN]',
      );
    });
  });

  describe('GET /audit-logs (Compliance RBAC on Production Route)', () => {
    let adminToken: string;
    let reviewerToken: string;
    let salesToken: string;

    beforeAll(async () => {
      const adminRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@example.com', password: 'Password123!' });
      adminToken = adminRes.body.accessToken;

      const reviewerRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'reviewer1@example.com', password: 'Password123!' });
      reviewerToken = reviewerRes.body.accessToken;

      const salesRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'sales1@example.com', password: 'Password123!' });
      salesToken = salesRes.body.accessToken;
    });

    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      const response = await request(app.getHttpServer())
        .get('/audit-logs')
        .expect(401);

      expect(response.body.message).toBe('Authentication required');
    });

    it('should reject SALES user with 403 Forbidden (separation of duties)', async () => {
      const response = await request(app.getHttpServer())
        .get('/audit-logs')
        .set('Authorization', `Bearer ${salesToken}`)
        .expect(403);

      expect(response.body.statusCode).toBe(403);
      expect(response.body.message).toContain(
        'Access denied: requires one of the following roles: [ADMIN]',
      );
    });

    it('should reject REVIEWER user with 403 Forbidden (reviewers cannot view global compliance logs)', async () => {
      const response = await request(app.getHttpServer())
        .get('/audit-logs')
        .set('Authorization', `Bearer ${reviewerToken}`)
        .expect(403);

      expect(response.body.statusCode).toBe(403);
      expect(response.body.message).toContain(
        'Access denied: requires one of the following roles: [ADMIN]',
      );
    });

    it('should permit ADMIN user to query compliance audit logs with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/audit-logs?limit=10&offset=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(typeof response.body.total).toBe('number');
    });
  });
});
