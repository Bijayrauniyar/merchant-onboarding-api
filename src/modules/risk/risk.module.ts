import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { RiskReview } from './entities/risk-review.entity';
import { MerchantApplication } from '../applications/entities/merchant-application.entity';
import { RiskProducer } from './risk.producer';
import { RiskProcessor } from './risk.processor';
import { SimulatedKybProvider } from './providers/simulated-kyb.provider';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RiskReview, MerchantApplication]),
    BullModule.registerQueue({
      name: 'risk-evaluation',
    }),
    AuditModule,
  ],
  providers: [RiskProducer, RiskProcessor, SimulatedKybProvider],
  exports: [TypeOrmModule, BullModule, RiskProducer, SimulatedKybProvider],
})
export class RiskModule {}
