import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 10 – Storage Spaces scaffold migration.
 *
 * The storage_spaces, storage_space_members (storage_members), and
 * media.storage_space_id column were all created in InitialSchema
 * (1777001909850). This migration is intentionally a no-op shell so the
 * migration history reflects Phase 10 work without duplicating DDL.
 *
 * If you are running against a database that pre-dates InitialSchema you
 * should run InitialSchema first; this file will then apply cleanly.
 */
export class CreateStorageSpaces1780000000000 implements MigrationInterface {
  name = 'CreateStorageSpaces1780000000000';

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // All required tables and columns already exist from InitialSchema.
    // No DDL changes needed.
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentional no-op — see up() comment above.
  }
}
