import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * Migration: CreateRiskReviewsTable1700000004000
 *
 * Creates the `risk_reviews` table for storing automated third-party KYB checks,
 * establishes foreign key relation to `merchant_applications`, and creates a
 * composite unique index on `(application_id, submission_version)` to enforce
 * Idempotency Layer 2 at the relational database level.
 */
export class CreateRiskReviewsTable1700000004000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'risk_reviews',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'application_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'submission_version',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'result',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'score',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'raw_response',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Foreign key referencing merchant_applications(id)
    await queryRunner.createForeignKey(
      'risk_reviews',
      new TableForeignKey({
        name: 'FK_risk_reviews_application_id',
        columnNames: ['application_id'],
        referencedTableName: 'merchant_applications',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Composite unique index enforcing Idempotency Layer 2
    await queryRunner.createIndex(
      'risk_reviews',
      new TableIndex({
        name: 'IDX_risk_reviews_application_id_submission_version',
        columnNames: ['application_id', 'submission_version'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'risk_reviews',
      'IDX_risk_reviews_application_id_submission_version',
    );
    await queryRunner.dropForeignKey(
      'risk_reviews',
      'FK_risk_reviews_application_id',
    );
    await queryRunner.dropTable('risk_reviews', true);
  }
}
