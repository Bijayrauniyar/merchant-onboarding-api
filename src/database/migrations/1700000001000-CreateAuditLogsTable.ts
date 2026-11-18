import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAuditLogsTable1700000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure uuid-ossp extension is enabled for UUID generation
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.createTable(
      new Table({
        name: 'audit_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'entity_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'entity_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'action',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'actor_id',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'actor_role',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
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

    // Composite index on entityName and entityId for timeline lookups
    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_entity',
        columnNames: ['entity_name', 'entity_id'],
      }),
    );

    // Index on actorId for user activity auditing
    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_actor',
        columnNames: ['actor_id'],
      }),
    );

    // Index on createdAt for chronological timeline ordering
    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_created_at',
        columnNames: ['created_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_created_at');
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_actor');
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_entity');
    await queryRunner.dropTable('audit_logs', true);
  }
}
