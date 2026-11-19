import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MerchantApplication } from '../../applications/entities/merchant-application.entity';
import { RiskResult } from '../enums/risk-result.enum';

/**
 * Domain entity representing an automated third-party KYB / risk assessment record.
 *
 * Invariants & Idempotency:
 * - Composite unique index on `(applicationId, submissionVersion)` enforces
 *   Idempotency Layer 2 at the relational database level.
 * - `score`: Integer risk score (0-100) returned by provider and natively hydrated as number by pg.
 * - `rawResponse`: JSONB payload preserving the full external verification audit trail.
 */
@Entity('risk_reviews')
@Index(['applicationId', 'submissionVersion'], { unique: true })
export class RiskReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => MerchantApplication, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application?: MerchantApplication;

  @Column({ name: 'submission_version', type: 'int' })
  submissionVersion!: number;

  @Column({
    type: 'varchar',
    length: 50,
  })
  result!: RiskResult;

  @Column({ type: 'int' })
  score!: number;

  @Column({ name: 'raw_response', type: 'jsonb' })
  rawResponse!: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
