import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { RiskReview } from './entities/risk-review.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([RiskReview]),
    BullModule.registerQueue({
      name: 'risk-evaluation',
    }),
  ],
  exports: [TypeOrmModule, BullModule],
})
export class RiskModule {}
