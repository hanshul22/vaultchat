import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the three auth-support columns to the users table that were added
 * to the User entity in Phase 5 (stub phase) but were missing from the
 * initial schema migration:
 *   - password_reset_token_hash
 *   - password_reset_token_expires_at
 *   - refresh_token_hash
 */
export class AddUserAuthColumns1777001909851 implements MigrationInterface {
  name = 'AddUserAuthColumns1777001909851';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "password_reset_token_hash"    varchar(64)      NULL,
        ADD COLUMN IF NOT EXISTS "password_reset_token_expires_at" timestamptz   NULL,
        ADD COLUMN IF NOT EXISTS "refresh_token_hash"           varchar(255)     NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users"
        DROP COLUMN IF EXISTS "password_reset_token_hash",
        DROP COLUMN IF EXISTS "password_reset_token_expires_at",
        DROP COLUMN IF EXISTS "refresh_token_hash"`,
    );
  }
}
