import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * Migration: CreateMerchantApplicationsTable1700000003000
 *
 * Creates the `merchant_applications` table with strict foreign key constraints,
 * B-Tree indexes on scoped query columns (created_by_id, assigned_reviewer_id, status),
 * and precision numeric fields for monetary volumes.
 */
export class CreateMerchantApplicationsTable1700000003000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'merchant_applications',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'business_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'legal_business_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'business_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'owner_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'owner_email',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'owner_phone',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'requested_monthly_volume',
            type: 'numeric',
            precision: 12,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'requested_avg_ticket',
            type: 'numeric',
            precision: 10,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            isNullable: false,
            default: "'DRAFT'",
          },
          {
            name: 'risk_status',
            type: 'varchar',
            length: '50',
            isNullable: false,
            default: "'NOT_STARTED'",
          },
          {
            name: 'submission_version',
            type: 'int',
            isNullable: false,
            default: 0,
          },
          {
            name: 'created_by_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'assigned_reviewer_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'decision_note',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'decided_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Foreign Key Constraints
    await queryRunner.createForeignKey(
      'merchant_applications',
      new TableForeignKey({
        name: 'FK_merchant_applications_created_by',
        columnNames: ['created_by_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createForeignKey(
      'merchant_applications',
      new TableForeignKey({
        name: 'FK_merchant_applications_assigned_reviewer',
        columnNames: ['assigned_reviewer_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    // B-Tree Indexes for Tier-2 Object-Level Authorization and Status Queues
    await queryRunner.createIndices('merchant_applications', [
      new TableIndex({
        name: 'IDX_merchant_applications_created_by_id',
        columnNames: ['created_by_id'],
      }),
      new TableIndex({
        name: 'IDX_merchant_applications_assigned_reviewer_id',
        columnNames: ['assigned_reviewer_id'],
      }),
      new TableIndex({
        name: 'IDX_merchant_applications_status',
        columnNames: ['status'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'merchant_applications',
      'IDX_merchant_applications_status',
    );
    await queryRunner.dropIndex(
      'merchant_applications',
      'IDX_merchant_applications_assigned_reviewer_id',
    );
    await queryRunner.dropIndex(
      'merchant_applications',
      'IDX_merchant_applications_created_by_id',
    );
    await queryRunner.dropForeignKey(
      'merchant_applications',
      'FK_merchant_applications_assigned_reviewer',
    );
    await queryRunner.dropForeignKey(
      'merchant_applications',
      'FK_merchant_applications_created_by',
    );
    await queryRunner.dropTable('merchant_applications', true);
  }
}
