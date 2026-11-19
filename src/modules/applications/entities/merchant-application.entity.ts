import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ApplicationStatus } from '../enums/application-status.enum';
import { RiskStatus } from '../enums/risk-status.enum';
import { BusinessType } from '../enums/business-type.enum';
import { numericColumnTransformer } from '../../../common/transformers/numeric.transformer';

/**
 * Domain entity representing a merchant onboarding application.
 *
 * Invariants:
 * - Applications are created by SALES or ADMIN users in DRAFT status.
 * - submissionVersion increments monotonically on each submission.
 * - status (business state) and riskStatus (async risk check) are orthogonal.
 * - Indexes on createdById, assignedReviewerId, and status accelerate scoped queries.
 */
@Entity('merchant_applications')
@Index(['createdById'])
@Index(['assignedReviewerId'])
@Index(['status'])
export class MerchantApplication {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'business_name', type: 'varchar', length: 255 })
  businessName!: string;

  @Column({ name: 'legal_business_name', type: 'varchar', length: 255 })
  legalBusinessName!: string;

  @Column({
    name: 'business_type',
    type: 'varchar',
    length: 50,
  })
  businessType!: BusinessType;

  @Column({ name: 'owner_name', type: 'varchar', length: 255 })
  ownerName!: string;

  @Column({ name: 'owner_email', type: 'varchar', length: 255 })
  ownerEmail!: string;

  @Column({ name: 'owner_phone', type: 'varchar', length: 50 })
  ownerPhone!: string;

  @Column({
    name: 'requested_monthly_volume',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericColumnTransformer,
  })
  requestedMonthlyVolume!: number;

  @Column({
    name: 'requested_avg_ticket',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericColumnTransformer,
  })
  requestedAvgTicket!: number;

  @Column({
    type: 'varchar',
    length: 50,
    default: ApplicationStatus.DRAFT,
  })
  status!: ApplicationStatus;

  @Column({
    name: 'risk_status',
    type: 'varchar',
    length: 50,
    default: RiskStatus.NOT_STARTED,
  })
  riskStatus!: RiskStatus;

  @Column({
    name: 'submission_version',
    type: 'int',
    default: 0,
  })
  submissionVersion!: number;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: User;

  @Column({ name: 'assigned_reviewer_id', type: 'uuid', nullable: true })
  assignedReviewerId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_reviewer_id' })
  assignedReviewer?: User | null;

  @Column({ name: 'decision_note', type: 'text', nullable: true })
  decisionNote!: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
