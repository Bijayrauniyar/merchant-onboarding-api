import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ApplicationStatus } from '../src/modules/applications/enums/application-status.enum';
import { RiskStatus } from '../src/modules/applications/enums/risk-status.enum';
import { BusinessType } from '../src/modules/applications/enums/business-type.enum';
import { ReviewerDecision } from '../src/modules/applications/enums/reviewer-decision.enum';

/**
 * End-to-End Integration Test Suite for Slice 5: Lifecycle Transitions & Reviewer Decisions.
 *
 * Verifies:
 * - Application submission (DRAFT -> SUBMITTED) and version increment.
 * - Reviewer assignment restricted to ADMIN.
 * - State Gating Invariant: Reviewer decisions strictly blocked with 409 Conflict while riskStatus == PENDING.
 * - Segregation of Duties: Route-level barring of ADMIN and SALES from reviewer decisions (403 Forbidden).
 * - Decision Isolation & Anti-Enumeration: Unassigned reviewers querying or deciding receive 404 Not Found.
 * - Information Request resubmission cycle (INFO_REQUESTED re-opens editing, resubmit increments version).
 * - Terminal states (APPROVED, REJECTED) are immutable.
 * - Transactional audit logs emitted across each lifecycle event with data masking.
 */
describe('Application Lifecycle & Reviewer Decisions (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let adminToken: string;
  let reviewer1Token: string;
  let reviewer1Id: string;
  let reviewer2Token: string;
  let reviewer2Id: string;
  let sales1Token: string;
  let sales1Id: string;
  let sales2Token: string;
  let sales2Id: string;

  const initialApplicationPayload = {
    businessName: 'Lakeside Roasters',
    legalBusinessName: 'Lakeside Roasters LLC',
    businessType: BusinessType.LLC,
    ownerName: 'Alice Walker',
    ownerEmail: 'alice@lakesideroasters.com',
    ownerPhone: '+14155551234',
    requestedMonthlyVolume: 65000.0,
    requestedAvgTicket: 55.0,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

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

    const rev1Res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'reviewer1@example.com', password: 'Password123!' });
    reviewer1Token = rev1Res.body.accessToken;
    reviewer1Id = rev1Res.body.user.id;

    const rev2Res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'reviewer2@example.com', password: 'Password123!' });
    reviewer2Token = rev2Res.body.accessToken;
    reviewer2Id = rev2Res.body.user.id;

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
    if (dataSource && dataSource.isInitialized) {
      await dataSource.query(
        `DELETE FROM audit_logs WHERE entity_name = 'MerchantApplication'`,
      );
      await dataSource.query(`DELETE FROM merchant_applications`);
    }
    await app.close();
  });

  describe('Phase 1: Submission Flow (POST /applications/:id/submit)', () => {
    let testAppId: string;

    beforeAll(async () => {
      const createRes = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${sales1Token}`)
        .send(initialApplicationPayload)
        .expect(201);
      testAppId = createRes.body.id;
    });

    it('should prevent SALES user 2 from submitting SALES user 1 application (Anti-Enumeration 404)', async () => {
      await request(app.getHttpServer())
        .post(`/applications/${testAppId}/submit`)
        .set('Authorization', `Bearer ${sales2Token}`)
        .expect(404);
    });

    it('should successfully advance DRAFT to SUBMITTED, set riskStatus=PENDING, and increment submissionVersion=1', async () => {
      const response = await request(app.getHttpServer())
        .post(`/applications/${testAppId}/submit`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(200);

      expect(response.body.id).toBe(testAppId);
      expect(response.body.status).toBe(ApplicationStatus.SUBMITTED);
      expect(response.body.riskStatus).toBe(RiskStatus.PENDING);
      expect(response.body.submissionVersion).toBe(1);
    });

    it('should reject resubmission when application is already SUBMITTED (409 Conflict)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/applications/${testAppId}/submit`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(409);

      expect(response.body.message).toContain(
        'Submission is only permitted in DRAFT or INFO_REQUESTED status',
      );
    });

    it('should lock application fields from editing while in SUBMITTED status (409 Conflict)', async () => {
      await request(app.getHttpServer())
        .patch(`/applications/${testAppId}`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({ businessName: 'Illegal Update Name' })
        .expect(409);
    });
  });

  describe('Phase 2: Reviewer Assignment (POST /applications/:id/assign)', () => {
    let submittedAppId: string;
    let draftAppId: string;

    beforeAll(async () => {
      // 1. Create and submit an application
      const createSubmitted = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({
          ...initialApplicationPayload,
          businessName: 'Assignment Test Merchant',
        })
        .expect(201);
      submittedAppId = createSubmitted.body.id;

      await request(app.getHttpServer())
        .post(`/applications/${submittedAppId}/submit`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(200);

      // 2. Create a draft application (not submitted)
      const createDraft = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({
          ...initialApplicationPayload,
          businessName: 'Draft Test Merchant',
        })
        .expect(201);
      draftAppId = createDraft.body.id;
    });

    it('should return 403 Forbidden when SALES user attempts to assign a reviewer', async () => {
      await request(app.getHttpServer())
        .post(`/applications/${submittedAppId}/assign`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({ reviewerId: reviewer1Id })
        .expect(403);
    });

    it('should return 403 Forbidden when REVIEWER attempts to assign a reviewer', async () => {
      await request(app.getHttpServer())
        .post(`/applications/${submittedAppId}/assign`)
        .set('Authorization', `Bearer ${reviewer1Token}`)
        .send({ reviewerId: reviewer1Id })
        .expect(403);
    });

    it('should return 400 Bad Request when target user does not exist', async () => {
      await request(app.getHttpServer())
        .post(`/applications/${submittedAppId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reviewerId: '00000000-0000-0000-0000-000000000000' })
        .expect(400);
    });

    it('should return 400 Bad Request when target user does not hold REVIEWER role', async () => {
      await request(app.getHttpServer())
        .post(`/applications/${submittedAppId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reviewerId: sales2Id })
        .expect(400);
    });

    it('should return 409 Conflict when attempting to assign a reviewer to a DRAFT application', async () => {
      const response = await request(app.getHttpServer())
        .post(`/applications/${draftAppId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reviewerId: reviewer1Id })
        .expect(409);

      expect(response.body.message).toContain('must be in SUBMITTED status');
    });

    it('should allow ADMIN to successfully assign reviewer 1 to submitted application', async () => {
      const response = await request(app.getHttpServer())
        .post(`/applications/${submittedAppId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reviewerId: reviewer1Id })
        .expect(200);

      expect(response.body.id).toBe(submittedAppId);
      expect(response.body.assignedReviewerId).toBe(reviewer1Id);
      expect(response.body.status).toBe(ApplicationStatus.SUBMITTED);
    });
  });

  describe('Phase 3: State Gating & Segregation of Duties (POST /applications/:id/decision)', () => {
    let gatedAppId: string;

    beforeAll(async () => {
      const createRes = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({
          ...initialApplicationPayload,
          businessName: 'State Gating Test Merchant',
        })
        .expect(201);
      gatedAppId = createRes.body.id;

      // Submit application -> sets riskStatus = PENDING
      await request(app.getHttpServer())
        .post(`/applications/${gatedAppId}/submit`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(200);

      // Admin assigns to reviewer 1
      await request(app.getHttpServer())
        .post(`/applications/${gatedAppId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reviewerId: reviewer1Id })
        .expect(200);
    });

    it('MANDATORY INVARIANT: should strictly block reviewer decision with 409 Conflict while riskStatus == PENDING', async () => {
      const response = await request(app.getHttpServer())
        .post(`/applications/${gatedAppId}/decision`)
        .set('Authorization', `Bearer ${reviewer1Token}`)
        .send({
          decision: ReviewerDecision.APPROVE,
          note: 'Premature approval attempt',
        })
        .expect(409);

      expect(response.body.message).toContain(
        'Automated risk review is still in progress',
      );
    });

    it('should return 403 Forbidden when ADMIN attempts to record a reviewer decision', async () => {
      await request(app.getHttpServer())
        .post(`/applications/${gatedAppId}/decision`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          decision: ReviewerDecision.APPROVE,
        })
        .expect(403);
    });

    it('should return 403 Forbidden when SALES attempts to record a reviewer decision', async () => {
      await request(app.getHttpServer())
        .post(`/applications/${gatedAppId}/decision`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({
          decision: ReviewerDecision.APPROVE,
        })
        .expect(403);
    });

    it('should return 404 Not Found when unassigned reviewer 2 attempts decision (Anti-Enumeration & Decision Isolation)', async () => {
      await request(app.getHttpServer())
        .post(`/applications/${gatedAppId}/decision`)
        .set('Authorization', `Bearer ${reviewer2Token}`)
        .send({
          decision: ReviewerDecision.APPROVE,
        })
        .expect(404);
    });

    it('should return 400 Bad Request when REJECT decision is missing explanatory note', async () => {
      // Temporarily mark risk as passed to test payload validation
      await dataSource.query(
        `UPDATE merchant_applications SET risk_status = 'PASSED' WHERE id = $1`,
        [gatedAppId],
      );

      const response = await request(app.getHttpServer())
        .post(`/applications/${gatedAppId}/decision`)
        .set('Authorization', `Bearer ${reviewer1Token}`)
        .send({
          decision: ReviewerDecision.REJECT,
        })
        .expect(400);

      expect(response.body.message).toContain(
        'note is mandatory when rejecting or requesting information',
      );
    });

    it('should return 400 Bad Request when REQUEST_INFO note is shorter than 5 characters', async () => {
      const response = await request(app.getHttpServer())
        .post(`/applications/${gatedAppId}/decision`)
        .set('Authorization', `Bearer ${reviewer1Token}`)
        .send({
          decision: ReviewerDecision.REQUEST_INFO,
          note: 'no',
        })
        .expect(400);

      expect(response.body.message).toContain(
        'note must be at least 5 characters long',
      );
    });
  });

  describe('Phase 4: Resubmission Lifecycle Cycle (REQUEST_INFO -> Edit -> Resubmit)', () => {
    let lifecycleAppId: string;

    beforeAll(async () => {
      const createRes = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({
          ...initialApplicationPayload,
          businessName: 'Resubmission Cycle Merchant',
        })
        .expect(201);
      lifecycleAppId = createRes.body.id;

      // Submit -> Version 1, riskStatus = PENDING
      await request(app.getHttpServer())
        .post(`/applications/${lifecycleAppId}/submit`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(200);

      // Admin assigns to Reviewer 1
      await request(app.getHttpServer())
        .post(`/applications/${lifecycleAppId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reviewerId: reviewer1Id })
        .expect(200);

      // Simulate completed background risk check
      await dataSource.query(
        `UPDATE merchant_applications SET risk_status = 'PASSED' WHERE id = $1`,
        [lifecycleAppId],
      );
    });

    it('should allow assigned reviewer to request additional information', async () => {
      const response = await request(app.getHttpServer())
        .post(`/applications/${lifecycleAppId}/decision`)
        .set('Authorization', `Bearer ${reviewer1Token}`)
        .send({
          decision: ReviewerDecision.REQUEST_INFO,
          note: 'Please provide the last 3 months of business bank statements.',
        })
        .expect(200);

      expect(response.body.status).toBe(ApplicationStatus.INFO_REQUESTED);
      expect(response.body.decisionNote).toBe(
        'Please provide the last 3 months of business bank statements.',
      );
      expect(response.body.decidedAt).toBeNull();
    });

    it('should re-open application editing for SALES user in INFO_REQUESTED status', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/applications/${lifecycleAppId}`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({
          businessName: 'Resubmission Cycle Merchant Updated',
          requestedMonthlyVolume: 90000.0,
        })
        .expect(200);

      expect(response.body.businessName).toBe(
        'Resubmission Cycle Merchant Updated',
      );
      expect(response.body.requestedMonthlyVolume).toBe(90000.0);
    });

    it('should allow SALES user to resubmit application, advancing to SUBMITTED and incrementing submissionVersion=2', async () => {
      const response = await request(app.getHttpServer())
        .post(`/applications/${lifecycleAppId}/submit`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(200);

      expect(response.body.status).toBe(ApplicationStatus.SUBMITTED);
      expect(response.body.submissionVersion).toBe(2);
      expect(response.body.riskStatus).toBe(RiskStatus.PENDING);
    });
  });

  describe('Phase 5: Terminal States (APPROVED & REJECTED)', () => {
    let approvalAppId: string;
    let rejectionAppId: string;

    beforeAll(async () => {
      // Prepare approval candidate
      const app1Res = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({
          ...initialApplicationPayload,
          businessName: 'Approval Merchant Candidate',
        })
        .expect(201);
      approvalAppId = app1Res.body.id;

      await request(app.getHttpServer())
        .post(`/applications/${approvalAppId}/submit`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/applications/${approvalAppId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reviewerId: reviewer1Id })
        .expect(200);

      await dataSource.query(
        `UPDATE merchant_applications SET risk_status = 'PASSED' WHERE id = $1`,
        [approvalAppId],
      );

      // Prepare rejection candidate
      const app2Res = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({
          ...initialApplicationPayload,
          businessName: 'Rejection Merchant Candidate',
        })
        .expect(201);
      rejectionAppId = app2Res.body.id;

      await request(app.getHttpServer())
        .post(`/applications/${rejectionAppId}/submit`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/applications/${rejectionAppId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reviewerId: reviewer1Id })
        .expect(200);

      await dataSource.query(
        `UPDATE merchant_applications SET risk_status = 'FLAGGED' WHERE id = $1`,
        [rejectionAppId],
      );
    });

    it('should successfully approve application and set status=APPROVED and decidedAt timestamp', async () => {
      const response = await request(app.getHttpServer())
        .post(`/applications/${approvalAppId}/decision`)
        .set('Authorization', `Bearer ${reviewer1Token}`)
        .send({
          decision: ReviewerDecision.APPROVE,
          note: 'KYB verification and AML screening passed with low risk score.',
        })
        .expect(200);

      expect(response.body.status).toBe(ApplicationStatus.APPROVED);
      expect(response.body.decidedAt).not.toBeNull();
      expect(response.body.decisionNote).toContain('KYB verification');
    });

    it('should make APPROVED status terminal: further decisions are rejected with 409 Conflict', async () => {
      await request(app.getHttpServer())
        .post(`/applications/${approvalAppId}/decision`)
        .set('Authorization', `Bearer ${reviewer1Token}`)
        .send({
          decision: ReviewerDecision.REJECT,
          note: 'Attempting decision on terminal application',
        })
        .expect(409);
    });

    it('should prevent edits on APPROVED application (409 Conflict)', async () => {
      await request(app.getHttpServer())
        .patch(`/applications/${approvalAppId}`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({ businessName: 'Mutate Approved App' })
        .expect(409);
    });

    it('should prevent resubmission of APPROVED application (409 Conflict)', async () => {
      await request(app.getHttpServer())
        .post(`/applications/${approvalAppId}/submit`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(409);
    });

    it('should successfully reject application with mandatory note and set status=REJECTED and decidedAt timestamp', async () => {
      const response = await request(app.getHttpServer())
        .post(`/applications/${rejectionAppId}/decision`)
        .set('Authorization', `Bearer ${reviewer1Token}`)
        .send({
          decision: ReviewerDecision.REJECT,
          note: 'High-risk business activity detected in sanctioned vertical.',
        })
        .expect(200);

      expect(response.body.status).toBe(ApplicationStatus.REJECTED);
      expect(response.body.decidedAt).not.toBeNull();
      expect(response.body.decisionNote).toContain('sanctioned vertical');
    });

    it('should make REJECTED status terminal: further decisions and edits are rejected with 409 Conflict', async () => {
      await request(app.getHttpServer())
        .post(`/applications/${rejectionAppId}/decision`)
        .set('Authorization', `Bearer ${reviewer1Token}`)
        .send({
          decision: ReviewerDecision.APPROVE,
          note: 'Attempting to revive rejected app',
        })
        .expect(409);

      await request(app.getHttpServer())
        .patch(`/applications/${rejectionAppId}`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({ businessName: 'Mutate Rejected App' })
        .expect(409);
    });
  });

  describe('Phase 6: Comprehensive Audit Trail Verification', () => {
    let auditedAppId: string;

    beforeAll(async () => {
      const createRes = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${sales1Token}`)
        .send({
          ...initialApplicationPayload,
          businessName: 'Audited Lifecycle Merchant',
        })
        .expect(201);
      auditedAppId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/applications/${auditedAppId}/submit`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/applications/${auditedAppId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reviewerId: reviewer1Id })
        .expect(200);

      await dataSource.query(
        `UPDATE merchant_applications SET risk_status = 'PASSED' WHERE id = $1`,
        [auditedAppId],
      );

      await request(app.getHttpServer())
        .post(`/applications/${auditedAppId}/decision`)
        .set('Authorization', `Bearer ${reviewer1Token}`)
        .send({
          decision: ReviewerDecision.APPROVE,
          note: 'Audit trail approval test',
        })
        .expect(200);
    });

    it('should verify all lifecycle events are recorded in the audit log with sensitive data masked', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/audit-logs?entityName=MerchantApplication&entityId=${auditedAppId}`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const logs = response.body.data;
      expect(logs.length).toBeGreaterThanOrEqual(4);

      const actions = logs.map((l: any) => l.action);
      expect(actions).toContain('APPLICATION_CREATED');
      expect(actions).toContain('APPLICATION_SUBMITTED');
      expect(actions).toContain('REVIEWER_ASSIGNED');
      expect(actions).toContain('DECISION_RECORDED');

      // Verify data masking invariant on created application log
      const createdLog = logs.find((l: any) => l.action === 'APPLICATION_CREATED');
      expect(createdLog.metadata.ownerEmail).toContain('***');
      expect(createdLog.metadata.ownerPhone).toContain('***');
    });
  });
});
