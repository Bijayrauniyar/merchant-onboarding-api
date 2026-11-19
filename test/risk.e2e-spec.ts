import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { MerchantApplication } from '../src/modules/applications/entities/merchant-application.entity';
import { RiskReview } from '../src/modules/risk/entities/risk-review.entity';
import { RiskProcessor } from '../src/modules/risk/risk.processor';
import { RiskProducer } from '../src/modules/risk/risk.producer';
import { SimulatedKybProvider } from '../src/modules/risk/providers/simulated-kyb.provider';
import { ApplicationStatus } from '../src/modules/applications/enums/application-status.enum';
import { RiskStatus } from '../src/modules/applications/enums/risk-status.enum';
import { BusinessType } from '../src/modules/applications/enums/business-type.enum';
import { ReviewerDecision } from '../src/modules/applications/enums/reviewer-decision.enum';
import { RiskResult } from '../src/modules/risk/enums/risk-result.enum';

/**
 * End-to-End Integration Test Suite for Slice 6 / F4:
 * Real PostgreSQL Concurrency Invariants, Idempotency, and Failure Resilience.
 *
 * Test cases:
 * a) Two parallel submit requests -> one 200, one 409; submissionVersion is 1; single queued job.
 * b) Two parallel decisions -> one 200, one 409; exactly one DECISION_RECORDED audit row.
 * c) Submit when queue.add throws -> 503, riskStatus FAILED, one RISK_REVIEW_FAILED audit row.
 * d) Processor does not overwrite assignedReviewerId if an admin assigns during processing.
 * e) Failure handler does not touch an application that has moved past SUBMITTED or has a newer submissionVersion.
 * f) Direct insert into risk_reviews with duplicate (applicationId, submissionVersion) throws 23505.
 */
describe('Risk Underwriting Concurrency & Idempotency (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let riskProducer: RiskProducer;
  let riskProcessor: RiskProcessor;
  let kybProvider: SimulatedKybProvider;
  let queue: Queue;

  let adminToken: string;
  let reviewer1Token: string;
  let reviewer1Id: string;
  let sales1Token: string;

  const validApplicationPayload = {
    businessName: 'Apex Roasters Corp',
    legalBusinessName: 'Apex Roasters Corporation',
    businessType: BusinessType.LLC,
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@apexroasters.com',
    ownerPhone: '+14155552671',
    requestedMonthlyVolume: 85000.0,
    requestedAvgTicket: 50.0,
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
    riskProducer = app.get(RiskProducer);
    riskProcessor = app.get(RiskProcessor);
    kybProvider = app.get(SimulatedKybProvider);
    queue = app.get<Queue>(getQueueToken('risk-evaluation'));

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

    const sales1Res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'sales1@example.com', password: 'Password123!' });
    sales1Token = sales1Res.body.accessToken;
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.query(`DELETE FROM risk_reviews`);
      await dataSource.query(
        `DELETE FROM audit_logs WHERE entity_name IN ('MerchantApplication', 'RiskReview')`,
      );
      await dataSource.query(`DELETE FROM merchant_applications`);
    }
    await app.close();
  });

  const createDraftApplication = async (token: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/applications')
      .set('Authorization', `Bearer ${token}`)
      .send(validApplicationPayload)
      .expect(201);
    return res.body.id;
  };

  describe('F4 (a): Parallel Submit Requests', () => {
    it('should serialize two concurrent submit requests: one returns 200, one returns 409, submissionVersion is 1, and one job exists', async () => {
      const appId = await createDraftApplication(sales1Token);

      // Fire 2 concurrent submit requests
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/applications/${appId}/submit`)
          .set('Authorization', `Bearer ${sales1Token}`),
        request(app.getHttpServer())
          .post(`/applications/${appId}/submit`)
          .set('Authorization', `Bearer ${sales1Token}`),
      ]);

      const statusCodes = [res1.status, res2.status].sort();
      expect(statusCodes).toEqual([200, 409]);

      const appRecord = await dataSource
        .getRepository(MerchantApplication)
        .findOneBy({ id: appId });
      expect(appRecord).toBeDefined();
      expect(appRecord!.status).toBe(ApplicationStatus.SUBMITTED);
      expect(appRecord!.submissionVersion).toBe(1);

      // Verify deterministic job id in Redis queue
      const job = await queue.getJob(`risk:${appId}:1`);
      expect(job).toBeDefined();
    });
  });

  describe('F4 (b): Parallel Reviewer Decisions', () => {
    it('should serialize two concurrent decisions: one returns 200, one returns 409, and exactly one DECISION_RECORDED audit row is emitted', async () => {
      const appId = await createDraftApplication(sales1Token);

      // Submit application
      await request(app.getHttpServer())
        .post(`/applications/${appId}/submit`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(200);

      // Assign reviewer
      await request(app.getHttpServer())
        .patch(`/applications/${appId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reviewerId: reviewer1Id })
        .expect(200);

      // Ungate decisions by setting riskStatus to PASSED
      await dataSource.getRepository(MerchantApplication).update(
        { id: appId },
        { riskStatus: RiskStatus.PASSED },
      );

      // Fire 2 concurrent decision requests (APPROVE vs REJECT)
      const [dec1, dec2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/applications/${appId}/decision`)
          .set('Authorization', `Bearer ${reviewer1Token}`)
          .send({ decision: ReviewerDecision.APPROVE }),
        request(app.getHttpServer())
          .post(`/applications/${appId}/decision`)
          .set('Authorization', `Bearer ${reviewer1Token}`)
          .send({
            decision: ReviewerDecision.REJECT,
            note: 'Application rejected due to high operational risk',
          }),
      ]);

      const statusCodes = [dec1.status, dec2.status].sort();
      expect(statusCodes).toEqual([200, 409]);

      // Assert exactly one DECISION_RECORDED audit entry exists
      const decisionAudits = await dataSource.query(
        `SELECT * FROM audit_logs WHERE entity_id = $1 AND action = 'DECISION_RECORDED'`,
        [appId],
      );
      expect(decisionAudits.length).toBe(1);
    });
  });

  describe('F4 (c): Enqueue Failure Handling', () => {
    it('should transition riskStatus to FAILED, record RISK_REVIEW_FAILED audit row, and return 503 if queue.add fails', async () => {
      const appId = await createDraftApplication(sales1Token);

      const enqueueSpy = jest
        .spyOn(riskProducer, 'enqueueRiskReview')
        .mockRejectedValueOnce(new Error('Redis cluster connection timeout'));

      const res = await request(app.getHttpServer())
        .post(`/applications/${appId}/submit`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(503);

      expect(res.body.message).toBe(
        'Application submitted, but the risk check could not be queued. It has been marked FAILED for manual review.',
      );

      const appRecord = await dataSource
        .getRepository(MerchantApplication)
        .findOneBy({ id: appId });
      expect(appRecord).toBeDefined();
      expect(appRecord!.status).toBe(ApplicationStatus.SUBMITTED);
      expect(appRecord!.riskStatus).toBe(RiskStatus.FAILED);
      expect(appRecord!.submissionVersion).toBe(1);

      const failureAudits = await dataSource.query(
        `SELECT * FROM audit_logs WHERE entity_id = $1 AND action = 'RISK_REVIEW_FAILED'`,
        [appId],
      );
      expect(failureAudits.length).toBe(1);
      expect(failureAudits[0].metadata).toEqual(
        expect.objectContaining({
          reason: 'ENQUEUE_FAILED',
        }),
      );

      enqueueSpy.mockRestore();
    });
  });

  describe('F4 (d): Processor Lost-Update Protection', () => {
    it('should preserve assignedReviewerId when admin assigns a reviewer while processor is running', async () => {
      const appId = await createDraftApplication(sales1Token);

      await request(app.getHttpServer())
        .post(`/applications/${appId}/submit`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(200);

      let adminAssignCompleted = false;
      const evaluateSpy = jest
        .spyOn(kybProvider, 'evaluateBusiness')
        .mockImplementationOnce(async () => {
          // While KYB check is in flight, Admin assigns reviewer1
          await request(app.getHttpServer())
            .patch(`/applications/${appId}/assign`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ reviewerId: reviewer1Id })
            .expect(200);
          adminAssignCompleted = true;

          return {
            result: RiskResult.PASSED,
            score: 92,
            rawResponse: { provider: 'SIMULATED_KYB', status: 'PASSED' },
          };
        });

      const mockJob = {
        id: `risk:${appId}:1`,
        data: { applicationId: appId, submissionVersion: 1 },
        attemptsMade: 0,
        opts: { attempts: 3 },
      } as any;

      await riskProcessor.process(mockJob);

      expect(adminAssignCompleted).toBe(true);

      const appRecord = await dataSource
        .getRepository(MerchantApplication)
        .findOneBy({ id: appId });
      expect(appRecord!.riskStatus).toBe(RiskStatus.PASSED);
      // assignedReviewerId must NOT be wiped back to null by the worker's update!
      expect(appRecord!.assignedReviewerId).toBe(reviewer1Id);

      evaluateSpy.mockRestore();
    });
  });

  describe('F4 (e): Failure Handler Guarded Execution', () => {
    it('should not mark application FAILED if status moved past SUBMITTED or submissionVersion is newer', async () => {
      const appId = await createDraftApplication(sales1Token);

      await request(app.getHttpServer())
        .post(`/applications/${appId}/submit`)
        .set('Authorization', `Bearer ${sales1Token}`)
        .expect(200);

      // Case 1: Application already transitioned to APPROVED
      await dataSource.getRepository(MerchantApplication).update(
        { id: appId },
        { status: ApplicationStatus.APPROVED, riskStatus: RiskStatus.PASSED },
      );

      await riskProcessor.handleFailureExhaustion(
        appId,
        1,
        'Stale retry failure callback',
        3,
      );

      let appRecord = await dataSource
        .getRepository(MerchantApplication)
        .findOneBy({ id: appId });
      expect(appRecord!.status).toBe(ApplicationStatus.APPROVED);
      expect(appRecord!.riskStatus).toBe(RiskStatus.PASSED);

      // Case 2: Application was resubmitted to submissionVersion = 2
      await dataSource.getRepository(MerchantApplication).update(
        { id: appId },
        {
          status: ApplicationStatus.SUBMITTED,
          submissionVersion: 2,
          riskStatus: RiskStatus.PENDING,
        },
      );

      // Stale version 1 job failure arrives
      await riskProcessor.handleFailureExhaustion(
        appId,
        1,
        'Stale retry failure for v1',
        3,
      );

      appRecord = await dataSource
        .getRepository(MerchantApplication)
        .findOneBy({ id: appId });
      expect(appRecord!.submissionVersion).toBe(2);
      expect(appRecord!.riskStatus).toBe(RiskStatus.PENDING);
    });
  });

  describe('F4 (f): Relational Idempotency (PostgreSQL 23505)', () => {
    it('should reject duplicate (applicationId, submissionVersion) insertions into risk_reviews with unique constraint error (23505)', async () => {
      const appId = await createDraftApplication(sales1Token);
      const riskReviewRepo = dataSource.getRepository(RiskReview);

      const review1 = riskReviewRepo.create({
        applicationId: appId,
        submissionVersion: 1,
        result: RiskResult.PASSED,
        score: 85,
        rawResponse: { provider: 'SIMULATED_KYB', status: 'PASSED' },
      });
      await riskReviewRepo.save(review1);

      const review2 = riskReviewRepo.create({
        applicationId: appId,
        submissionVersion: 1,
        result: RiskResult.FLAGGED,
        score: 40,
        rawResponse: { provider: 'SIMULATED_KYB', status: 'FLAGGED' },
      });

      let errorCaught: any = null;
      try {
        await riskReviewRepo.save(review2);
      } catch (err) {
        errorCaught = err;
      }

      expect(errorCaught).toBeDefined();
      expect(errorCaught.code).toBe('23505');
    });
  });
});
