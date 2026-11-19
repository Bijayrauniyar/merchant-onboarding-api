import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { UserRole } from '../src/modules/users/enums/user-role.enum';
import { ApplicationStatus } from '../src/modules/applications/enums/application-status.enum';
import { BusinessType } from '../src/modules/applications/enums/business-type.enum';
import { MerchantApplication } from '../src/modules/applications/entities/merchant-application.entity';

describe('Merchant Applications & Object-Level Scoping (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let adminToken: string;
  let reviewerToken: string;
  let sales1Token: string;
  let sales2Token: string;
  let sales1Id: string;
  let sales2Id: string;

  let createdApplicationId: string;

  const validApplicationPayload = {
    businessName: 'Apex Roasters',
    legalBusinessName: 'Apex Roasters LLC',
    businessType: BusinessType.LLC,
    ownerName: 'Jane Smith',
    ownerEmail: 'jane.smith@apexroasters.com',
    ownerPhone: '+14155552671',
    requestedMonthlyVolume: 75000.0,
    requestedAvgTicket: 45.5,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mirror production main.ts configuration
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
    dataSource = app.get(DataSource);

    // Authenticate test personas
    const adminRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'Password123!' });
    adminToken = adminRes.body.accessToken;

    const reviewerRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'reviewer1@example.com', password: 'Password123!' });
    reviewerToken = reviewerRes.body.accessToken;

    const sales1Res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'sales1@example.com', password: 'Password123!' });
    sales1Token = sales1Res.body.accessToken;
    sales1Id = sales1Res.body.user.id;

    const sales2Res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'sales2@example.com', password: 'Password123!' });
    sales2Token = sales2Res.body.accessToken;
    sales2Id = sales2Res.body.user.id;
  });

  afterAll(async () => {
    // Clean up created test applications and associated audit logs
    if (dataSource && dataSource.isInitialized) {
      await dataSource.query(
        `DELETE FROM audit_logs WHERE entity_name = 'MerchantApplication'`,
      );
      await dataSource.query(`DELETE FROM merchant_applications`);
    }
    await app.close();
  });

  describe('POST /applications (Creation & Input Validation)', () => {
    it('should allow SALES user to create a new draft application', async () => {
      const response = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${sales1Token}`)
        .send(validApplicationPayload)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.businessName).toBe('Apex Roasters');
      expect(response.body.legalBusinessName).toBe('Apex Roasters LLC');
      expect(response.body.businessType).toBe(BusinessType.LLC);
      expect(response.body.ownerName).toBe('Jane Smith');
      expect(response.body.ownerEmail).toBe('jane.smith@apexroasters.com');
      expect(response.body.ownerPhone).toBe('+14155552671');
      expect(Number(response.body.requestedMonthlyVolume)).toBe(75000);
      expect(Number(response.body.requestedAvgTicket)).toBe(45.5);
      expect(response.body.status).toBe(ApplicationStatus.DRAFT);
      expect(response.body.riskStatus).toBe('NOT_STARTED');
      expect(response.body.submissionVersion).toBe(0);
      expect(response.body.createdById).toBe(sales1Id);
      expect(response.body.assignedReviewerId).toBeNull();

      createdApplicationId = response.body.id;
    });

    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      const response = await request(app.getHttpServer())
        .post('/applications')
        .send(validApplicationPayload)
        .expect(401);

      expect(response.body.message).toBe('Authentication required');
    });

    it('should reject REVIEWER from creating applications with 403 Forbidden (Tier 1)', async () => {
      const response = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${reviewerToken}`)
        .send(validApplicationPayload)
        .expect(403);

      expect(response.body.statusCode).toBe(403);
      expect(response.body.message).toContain('Access denied');
    });

    it('should reject unwhitelisted properties with 400 Bad Request (Mass Assignment Defense)', async () => {
      const response = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({
          ...validApplicationPayload,
          status: ApplicationStatus.APPROVED,
          riskStatus: 'PASSED',
          submissionVersion: 99,
          isAdminOverride: true,
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          'property status should not exist',
          'property riskStatus should not exist',
          'property submissionVersion should not exist',
          'property isAdminOverride should not exist',
        ]),
      );
    });

    it('should reject payload with missing mandatory fields with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({
          businessName: 'Incomplete Coffee',
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          'legalBusinessName is required',
          'ownerEmail is required',
        ]),
      );
    });

    it('should reject negative or zero requested currency volumes with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({
          ...validApplicationPayload,
          requestedMonthlyVolume: -500,
          requestedAvgTicket: 0,
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          'requestedMonthlyVolume must be positive',
          'requestedAvgTicket must be positive',
        ]),
      );
    });
  });

  describe('GET /applications/:id (Object-Level Scoping & Anti-IDOR)', () => {
    it('should allow sales1 to retrieve their own application by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/applications/${createdApplicationId}`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(200);

      expect(response.body.id).toBe(createdApplicationId);
      expect(response.body.businessName).toBe('Apex Roasters');
      expect(response.body.createdById).toBe(sales1Id);
    });

    it('should return 404 Not Found when sales2 queries sales1 application (Anti-Enumeration Invariant)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/applications/${createdApplicationId}`)
        .set('Authorization', `Bearer ${sales2Token}`)
        .expect(404);

      // CRITICAL SECURITY INVARIANT: Must return 404, NEVER 403
      expect(response.body.statusCode).toBe(404);
      expect(response.body.message).toContain('not found');
    });

    it('should return 404 Not Found when an unassigned REVIEWER queries the application', async () => {
      const response = await request(app.getHttpServer())
        .get(`/applications/${createdApplicationId}`)
        .set('Authorization', `Bearer ${reviewerToken}`)
        .expect(404);

      expect(response.body.statusCode).toBe(404);
      expect(response.body.message).toContain('not found');
    });

    it('should allow ADMIN to retrieve any application by ID (operational unscoped access)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/applications/${createdApplicationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.id).toBe(createdApplicationId);
      expect(response.body.businessName).toBe('Apex Roasters');
    });

    it('should reject non-UUID parameter with 400 Bad Request (ParseUUIDPipe)', async () => {
      const response = await request(app.getHttpServer())
        .get('/applications/not-a-valid-uuid')
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(400);

      expect(response.body.message).toBe(
        'Validation failed (uuid is expected)',
      );
    });

    it('should return 404 Not Found for a truly non-existent UUID', async () => {
      const response = await request(app.getHttpServer())
        .get('/applications/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(404);

      expect(response.body.message).toContain('not found');
    });
  });

  describe('PATCH /applications/:id (Ownership Scoping & Editability)', () => {
    it('should allow creator (sales1) to update an application in DRAFT status', async () => {
      const updatePayload = {
        businessName: 'Apex Coffee Roasters Ltd',
        requestedMonthlyVolume: 90000.0,
      };

      const response = await request(app.getHttpServer())
        .patch(`/applications/${createdApplicationId}`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .send(updatePayload)
        .expect(200);

      expect(response.body.id).toBe(createdApplicationId);
      expect(response.body.businessName).toBe('Apex Coffee Roasters Ltd');
      expect(Number(response.body.requestedMonthlyVolume)).toBe(90000);
    });

    it('should return 404 Not Found when sales2 attempts to PATCH sales1 application (Anti-IDOR)', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/applications/${createdApplicationId}`)
        .set('Authorization', `Bearer ${sales2Token}`)
        .send({ businessName: 'Malicious Hijack' })
        .expect(404);

      // Must be 404, never 403
      expect(response.body.statusCode).toBe(404);
      expect(response.body.message).toContain('not found');
    });

    it('should reject REVIEWER with 403 Forbidden when attempting to PATCH application details', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/applications/${createdApplicationId}`)
        .set('Authorization', `Bearer ${reviewerToken}`)
        .send({ businessName: 'Reviewer Edit Attempt' })
        .expect(403);

      expect(response.body.statusCode).toBe(403);
    });

    it('should reject unwhitelisted fields on update with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/applications/${createdApplicationId}`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({
          businessName: 'Valid Name',
          status: ApplicationStatus.APPROVED,
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining(['property status should not exist']),
      );
    });

    it('should reject update with 409 Conflict if application is locked in non-editable status', async () => {
      // Transition application to SUBMITTED directly in database to test editability lock
      const appRepo = dataSource.getRepository(MerchantApplication);
      await appRepo.update(createdApplicationId, {
        status: ApplicationStatus.SUBMITTED,
      });

      const response = await request(app.getHttpServer())
        .patch(`/applications/${createdApplicationId}`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({ businessName: 'Post Submission Edit' })
        .expect(409);

      expect(response.body.statusCode).toBe(409);
      expect(response.body.message).toContain(
        `Application cannot be updated in status '${ApplicationStatus.SUBMITTED}'`,
      );

      // Restore to DRAFT for subsequent tests
      await appRepo.update(createdApplicationId, {
        status: ApplicationStatus.DRAFT,
      });
    });

    it('should allow update when application is in INFO_REQUESTED status', async () => {
      // Simulate Reviewer requesting more info: status moves to INFO_REQUESTED
      const appRepo = dataSource.getRepository(MerchantApplication);
      await appRepo.update(createdApplicationId, {
        status: ApplicationStatus.INFO_REQUESTED,
      });

      const response = await request(app.getHttpServer())
        .patch(`/applications/${createdApplicationId}`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({
          businessName: 'Apex Coffee Roasters (Clarified)',
          ownerPhone: '+14155559999',
        })
        .expect(200);

      expect(response.body.businessName).toBe('Apex Coffee Roasters (Clarified)');
      expect(response.body.ownerPhone).toBe('+14155559999');

      // Restore to DRAFT
      await appRepo.update(createdApplicationId, {
        status: ApplicationStatus.DRAFT,
      });
    });
  });

  describe('GET /applications (Scoped Listing & Pagination)', () => {
    let sales2AppId: string;

    beforeAll(async () => {
      // sales2 creates an application of their own
      const res = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${sales2Token}`)
        .send({
          ...validApplicationPayload,
          businessName: 'Bob Bakery Supplies',
          legalBusinessName: 'Bob Bakery LLC',
        });
      sales2AppId = res.body.id;
    });

    it('should list only applications created by sales1 when requested by sales1', async () => {
      const response = await request(app.getHttpServer())
        .get('/applications')
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);

      // Verify every application returned belongs strictly to sales1
      for (const item of response.body.data) {
        expect(item.createdById).toBe(sales1Id);
      }
      // Ensure sales2's application is not leaked
      const foundSales2App = response.body.data.find(
        (a: any) => a.id === sales2AppId,
      );
      expect(foundSales2App).toBeUndefined();
    });

    it('should list only applications created by sales2 when requested by sales2', async () => {
      const response = await request(app.getHttpServer())
        .get('/applications')
        .set('Authorization', `Bearer ${sales2Token}`)
        .expect(200);

      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].id).toBe(sales2AppId);
      expect(response.body.data[0].createdById).toBe(sales2Id);
    });

    it('should list all applications across all users when requested by ADMIN', async () => {
      const response = await request(app.getHttpServer())
        .get('/applications')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.total).toBeGreaterThanOrEqual(2);
      const ids = response.body.data.map((a: any) => a.id);
      expect(ids).toContain(createdApplicationId);
      expect(ids).toContain(sales2AppId);
    });

    it('should filter applications by status query parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/applications?status=DRAFT')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      for (const item of response.body.data) {
        expect(item.status).toBe(ApplicationStatus.DRAFT);
      }
    });

    it('should reject invalid status filter parameter with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .get('/applications?status=NOT_A_VALID_STATUS')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('status must be one of:'),
        ]),
      );
    });

    it('should support pagination limit and page parameters', async () => {
      const response = await request(app.getHttpServer())
        .get('/applications?page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(1);
      expect(response.body.data.length).toBe(1);
      expect(response.body.totalPages).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Transactional Audit Logging Verification', () => {
    it('should have recorded APPLICATION_CREATED and APPLICATION_UPDATED in audit_logs with masked PII', async () => {
      const response = await request(app.getHttpServer())
        .get(`/audit-logs?entityId=${createdApplicationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.total).toBeGreaterThanOrEqual(2);

      const actions = response.body.data.map((l: any) => l.action);
      expect(actions).toContain('APPLICATION_CREATED');
      expect(actions).toContain('APPLICATION_UPDATED');

      // Verify that owner email and phone were masked in metadata
      const creationLog = response.body.data.find(
        (l: any) => l.action === 'APPLICATION_CREATED',
      );
      expect(creationLog.metadata.ownerEmail).toContain('***');
      expect(creationLog.metadata.ownerPhone).toContain('***-***-');
    });
  });
});
