import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RiskProducer } from './risk.producer';

describe('RiskProducer', () => {
  let producer: RiskProducer;
  let mockQueue: jest.Mocked<Partial<Queue>>;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' } as any),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskProducer,
        {
          provide: getQueueToken('risk-evaluation'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    producer = module.get<RiskProducer>(RiskProducer);
  });

  describe('enqueueRiskReview', () => {
    it('should enqueue a job with deterministic jobId and resilience options', async () => {
      const appId = '123e4567-e89b-12d3-a456-426614174000';
      const version = 1;

      await producer.enqueueRiskReview(appId, version);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'risk-evaluation',
        {
          applicationId: appId,
          submissionVersion: version,
        },
        {
          jobId: `risk:${appId}:${version}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    });

    it('should format deterministic jobId correctly across different versions', async () => {
      const appId = 'app-xyz-789';
      await producer.enqueueRiskReview(appId, 3);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'risk-evaluation',
        expect.anything(),
        expect.objectContaining({
          jobId: 'risk:app-xyz-789:3',
        }),
      );
    });

    it('should propagate errors if Redis queue dispatch fails', async () => {
      mockQueue.add = jest.fn().mockRejectedValue(new Error('Redis connection refused'));

      await expect(
        producer.enqueueRiskReview('app-1', 1),
      ).rejects.toThrow('Redis connection refused');
    });
  });
});
