import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDirectUploadContract1781000000000 implements MigrationInterface {
  name = 'AddDirectUploadContract1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'media_upload_status'
        ) THEN
          CREATE TYPE "public"."media_upload_status" AS ENUM ('uploading', 'ready', 'failed');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "media"
      ADD COLUMN IF NOT EXISTS "is_multipart" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "media"
      ADD COLUMN IF NOT EXISTS "total_parts" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "media"
      ADD COLUMN IF NOT EXISTS "upload_status" "public"."media_upload_status" NOT NULL DEFAULT 'ready'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "media_parts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "media_id" uuid NOT NULL,
        "part_index" integer NOT NULL,
        "total_parts" integer NOT NULL,
        "cloudinary_public_id" character varying(255) NOT NULL,
        "cloud_name" character varying(100) NOT NULL,
        "size_bytes" bigint NOT NULL,
        "cloudinary_account_id" uuid NOT NULL,
        "mime_type" character varying(100) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_4e1ef008e97c886db5f5be8b6c0" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_media_part_media_id"
      ON "media_parts" ("media_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_media_part_media_id_part_index"
      ON "media_parts" ("media_id", "part_index")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."uq_media_part_media_id_part_index"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_media_part_media_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "media_parts"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN IF EXISTS "upload_status"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN IF EXISTS "total_parts"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN IF EXISTS "is_multipart"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."media_upload_status"`);
  }
}
