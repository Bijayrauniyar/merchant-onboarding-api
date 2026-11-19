import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface RiskJobData {
  applicationId: string;
  submissionVersion: number;
}

/**
 * Queue producer service for dispatching asynchronous risk evaluation jobs.
 *
 * Invariants & Idempotency:
 * - Deterministic Job ID: `risk:${applicationId}:${submissionVersion}` enforces
 *   Idempotency Layer 1 at the Redis queue level (duplicates dropped).
 * - Post-Commit Dispatch: Enqueueing must be called strictly after database transactions commit.
 * - Exponential Backoff: Configured with 3 attempts and 2s base exponential delay (2s, 4s, 8s).
 */
@Injectable()
export class RiskProducer {
  private readonly logger = new Logger(RiskProducer.name);

  constructor(
    @InjectQueue('risk-evaluation')
    private readonly riskQueue: Queue<RiskJobData>,
  ) {}

  /**
   * Dispatches an asynchronous risk review job to Redis.
   *
   * @param applicationId Unique merchant application identifier
   * @param submissionVersion Application submission version number
   */
  async enqueueRiskReview(
    applicationId: string,
    submissionVersion: number,
  ): Promise<void> {
    const jobId = `risk:${applicationId}:${submissionVersion}`;

    await this.riskQueue.add(
      'risk-evaluation',
      { applicationId, submissionVersion },
      {
        jobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(
      `Dispatched risk evaluation job '${jobId}' for application '${applicationId}' (version ${submissionVersion})`,
    );
  }
}
