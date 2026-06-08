import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordResetFields1779454627006 implements MigrationInterface {
  name = 'AddPasswordResetFields1779454627006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_token_hash" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_token_expires_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password_reset_token_expires_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password_reset_token_hash"`);
  }
}
