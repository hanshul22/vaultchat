import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenHash1777752142048 implements MigrationInterface {
  name = 'AddRefreshTokenHash1777752142048';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "refresh_token_hash" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "refresh_token_hash"`);
  }
}
