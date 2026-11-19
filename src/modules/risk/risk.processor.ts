import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Job } from 'bullmq';
import { RiskReview } from './entities/risk-review.entity';
import { MerchantApplication } from '../applications/entities/merchant-application.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { RiskStatus } from '../applications/enums/risk-status.enum';
import { RiskResult } from './enums/risk-result.enum';
import { SimulatedKybProvider } from './providers/simulated-kyb.provider';
import { AuditService } from '../audit/audit.service';
import { RiskJobData } from './risk.producer';

/**
 * BullMQ Worker Processor executing asynchronous underwriting and KYB verification.
 *
 * Invariants & Idempotency:
 * - Layer 1 (Queue): Deterministic job ID in Redis drops duplicates.
 * - Layer 2 (Relational): Composite unique index `(application_id, submission_version)` prevents duplicate rows.
 * - Layer 3 (Worker): Pre-checks discard stale submission versions and already completed reviews.
 * - Resilience: Exponential retries (2s, 4s, 8s). On exhaustion, cleanly transitions application to FAILED.
 */
@Processor('risk-evaluation')
@Injectable()
export class RiskProcessor extends WorkerHost {
  private readonly logger = new Logger(RiskProcessor.name);

  constructor(
    @InjectRepository(MerchantApplication)
    private readonly applicationRepository: Repository<MerchantApplication>,
    @InjectRepository(RiskReview)
    private readonly riskReviewRepository: Repository<RiskReview>,
    private readonly kybProvider: SimulatedKybProvider,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  /**
   * Main job processing handler invoked by BullMQ workers.
   *
   * @param job Active BullMQ job containing applicationId and submissionVersion
   */
  async process(job: Job<RiskJobData>): Promise<void> {
    const { applicationId, submissionVersion } = job.data;
    this.logger.log(
      `Processing risk review job '${job.id}' for application '${applicationId}' (version ${submissionVersion})`,
    );

    // Idempotency Layer 3 - Pre-Check 1: Verify application state & version freshness
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
    });

    if (!application) {
      this.logger.warn(
        `Job '${job.id}' skipped: Application '${applicationId}' not found.`,
      );
      return;
    }

    if (application.status !== ApplicationStatus.SUBMITTED) {
      this.logger.warn(
        `Job '${job.id}' skipped: Application '${applicationId}' is in '${application.status}' (expected SUBMITTED).`,
      );
      return;
    }

    if (application.submissionVersion !== submissionVersion) {
      this.logger.warn(
        `Job '${job.id}' skipped: Stale submission version ${submissionVersion} (current application version is ${application.submissionVersion}).`,
      );
      return;
    }

    // Idempotency Layer 3 - Pre-Check 2: Check if review record already exists
    const existingReview = await this.riskReviewRepository.findOne({
      where: { applicationId, submissionVersion },
    });

    if (existingReview) {
      this.logger.log(
        `Job '${job.id}' skipped: RiskReview for application '${applicationId}' (version ${submissionVersion}) already exists.`,
      );
      return;
    }

    // Invoke third-party simulated KYB screening
    try {
      const kybResult = await this.kybProvider.evaluateBusiness(
        application.businessName,
      );

      // Persist review and update application state inside an atomic transaction
      await this.dataSource.transaction(async (manager) => {
        const riskReview = manager.create(RiskReview, {
          applicationId: application.id,
          submissionVersion,
          result: kybResult.result,
          score: kybResult.score,
          rawResponse: kybResult.rawResponse,
        });
        await manager.save(RiskReview, riskReview);

        application.riskStatus =
          kybResult.result === RiskResult.FLAGGED
            ? RiskStatus.FLAGGED
            : RiskStatus.PASSED;
        await manager.save(MerchantApplication, application);

        await this.auditService.log(
          {
            entityName: 'MerchantApplication',
            entityId: application.id,
            action: 'RISK_REVIEW_COMPLETED',
            actorId: 'system',
            actorRole: 'SYSTEM',
            metadata: {
              result: kybResult.result,
              score: kybResult.score,
              submissionVersion,
            },
          },
          manager,
        );
      });

      this.logger.log(
        `Completed risk evaluation for application '${applicationId}' (version ${submissionVersion}): Result=${kybResult.result}, Score=${kybResult.score}`,
      );
    } catch (error: any) {
      // Idempotency Layer 2: Gracefully absorb relational unique violation collisions
      if (error?.code === '23505') {
        this.logger.warn(
          `Relational collision (Layer 2): RiskReview for '${applicationId}' v${submissionVersion} was already persisted by a concurrent worker. Skipping.`,
        );
        return;
      }

      this.logger.error(
        `Risk evaluation attempt ${job.attemptsMade + 1} failed for application '${applicationId}': ${error?.message}`,
      );
      throw error;
    }
  }

  /**
   * BullMQ worker event listener triggered when a job fails an attempt.
   * If all configured retry attempts have been exhausted, transitions riskStatus to FAILED.
   *
   * @param job Failed BullMQ job instance
   * @param error Underlying error thrown by the processor
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<RiskJobData> | undefined, error: Error): Promise<void> {
    if (!job) return;

    const maxAttempts = job.opts?.attempts ?? 3;
    if (job.attemptsMade >= maxAttempts) {
      this.logger.warn(
        `Job '${job.id}' exhausted all ${maxAttempts} retry attempts. Transitioning application '${job.data.applicationId}' riskStatus to FAILED.`,
      );
      await this.handleFailureExhaustion(
        job.data.applicationId,
        error?.message || 'External KYB provider failure',
        job.attemptsMade,
      );
    }
  }

  /**
   * Executes atomic database transition moving application riskStatus to FAILED
   * and records a RISK_REVIEW_FAILED audit entry.
   *
   * @param applicationId Merchant application identifier
   * @param reason Failure message or error description
   * @param attempts Total retry attempts made prior to exhaustion
   */
  async handleFailureExhaustion(
    applicationId: string,
    reason: string,
    attempts: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const application = await manager.findOne(MerchantApplication, {
        where: { id: applicationId },
      });

      if (!application) {
        this.logger.error(
          `Cannot mark application '${applicationId}' as FAILED: Record not found.`,
        );
        return;
      }

      application.riskStatus = RiskStatus.FAILED;
      await manager.save(MerchantApplication, application);

      await this.auditService.log(
        {
          entityName: 'MerchantApplication',
          entityId: application.id,
          action: 'RISK_REVIEW_FAILED',
          actorId: 'system',
          actorRole: 'SYSTEM',
          metadata: {
            reason,
            attempts,
          },
        },
        manager,
      );
    });
  }
}
