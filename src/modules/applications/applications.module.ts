import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantApplication } from './entities/merchant-application.entity';
import { User } from '../users/entities/user.entity';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MerchantApplication, User]),
    AuditModule,
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
