import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1777001909850 implements MigrationInterface {
    name = 'InitialSchema1777001909850'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."cloudinary_account_role" AS ENUM('primary', 'secondary')`);
        await queryRunner.query(`CREATE TABLE "cloudinary_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "cloud_name" character varying(100) NOT NULL, "api_key" character varying(100) NOT NULL, "api_secret_encrypted" text NOT NULL, "role" "public"."cloudinary_account_role" NOT NULL, "secondary_order" smallint, "storage_used_bytes" bigint NOT NULL DEFAULT '0', "storage_limit_bytes" bigint NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "last_reconciled_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_role_secondary_order_consistency" CHECK ((role = 'primary' AND secondary_order IS NULL)
   OR (role = 'secondary' AND secondary_order IN (1, 2))), CONSTRAINT "PK_822c50ad66dcf05e7ae05b53996" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_61466dc625be738211baf6d138" ON "cloudinary_accounts" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_user_active_secondary_slot" ON "cloudinary_accounts" ("user_id", "secondary_order") WHERE "role" = 'secondary' AND "is_active" = true`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_user_active_primary" ON "cloudinary_accounts" ("user_id") WHERE "role" = 'primary' AND "is_active" = true`);
        await queryRunner.query(`CREATE TABLE "conversation_members" ("conversation_id" uuid NOT NULL, "user_id" uuid NOT NULL, "last_read_message_id" uuid, "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5fa9076068b6f2a26fb793d2439" PRIMARY KEY ("conversation_id", "user_id"))`);
        await queryRunner.query(`CREATE INDEX "idx_conversation_member_user" ON "conversation_members" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(120), "is_group" boolean NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "sender_id" uuid NOT NULL, "body" character varying(10000) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3bc55a7c3f9ed54b520bb5cfe2" ON "messages" ("conversation_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_22133395bd13b970ccd0c34ab2" ON "messages" ("sender_id") `);
        await queryRunner.query(`CREATE INDEX "idx_message_conversation_created_at" ON "messages" ("conversation_id", "created_at") `);
        await queryRunner.query(`CREATE TABLE "message_media" ("message_id" uuid NOT NULL, "media_id" uuid NOT NULL, "order_index" integer, "attached_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_eba81993aef95a76085b3580cf3" PRIMARY KEY ("message_id", "media_id"))`);
        await queryRunner.query(`CREATE TYPE "public"."storage_member_role" AS ENUM('editor', 'viewer')`);
        await queryRunner.query(`CREATE TABLE "storage_members" ("space_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" "public"."storage_member_role" NOT NULL, "added_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9f184f95b4a1f7ca735e55c36cf" PRIMARY KEY ("space_id", "user_id"))`);
        await queryRunner.query(`CREATE INDEX "idx_storage_member_user" ON "storage_members" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "storage_spaces" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_id" uuid NOT NULL, "name" character varying(120) NOT NULL, "description" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_64cf820faf98f6dc623896f2ae6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3f1d27993fa0897c6102d7815c" ON "storage_spaces" ("owner_id") `);
        await queryRunner.query(`CREATE TABLE "media" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_id" uuid NOT NULL, "cloudinary_account_id" uuid NOT NULL, "storage_space_id" uuid, "cloudinary_public_id" character varying(255) NOT NULL, "url" text NOT NULL, "mime_type" character varying(100) NOT NULL, "size_bytes" bigint NOT NULL, "width" integer, "height" integer, "duration_seconds" numeric(10,3), "is_orphaned" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_f4e0fcac36e050de337b670d8bd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c6889397830b5ed0f2a3036206" ON "media" ("owner_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_184389866e278877c4ab26ecd4" ON "media" ("cloudinary_account_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_893973bea729fa0678c4c658e4" ON "media" ("storage_space_id") `);
        await queryRunner.query(`CREATE INDEX "idx_media_space_created_at" ON "media" ("storage_space_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_media_owner_created_at" ON "media" ("owner_id", "created_at") `);
        await queryRunner.query(`CREATE TABLE "album_media" ("album_id" uuid NOT NULL, "media_id" uuid NOT NULL, "order_index" integer, "added_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_842d66e69185315306d2e8b194b" PRIMARY KEY ("album_id", "media_id"))`);
        await queryRunner.query(`CREATE INDEX "idx_album_media_album_added_at" ON "album_media" ("album_id", "added_at") `);
        await queryRunner.query(`CREATE TABLE "albums" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_id" uuid NOT NULL, "name" character varying(120) NOT NULL, "description" text, "cover_media_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_838ebae24d2e12082670ffc95d7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_14dfb720709372ede2fc2e1585" ON "albums" ("owner_id") `);
        await queryRunner.query(`CREATE INDEX "idx_album_owner_created_at" ON "albums" ("owner_id", "created_at") `);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(255) NOT NULL, "full_name" character varying(120) NOT NULL, "password_hash" character varying(255) NOT NULL, "google_id" character varying(64), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_0d4823e097ee3f1f6279807c87" ON "users" ("google_id") WHERE "google_id" IS NOT NULL`);
        await queryRunner.query(`ALTER TABLE "cloudinary_accounts" ADD CONSTRAINT "FK_61466dc625be738211baf6d138e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversation_members" ADD CONSTRAINT "FK_36340a1704b039608e34244511f" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversation_members" ADD CONSTRAINT "FK_a46c76be8f62c4b00a835cdc370" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_22133395bd13b970ccd0c34ab22" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "message_media" ADD CONSTRAINT "FK_5e876c5aff8c5304fb0dc2906a9" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "message_media" ADD CONSTRAINT "FK_4b57256212b997b5cdaf9941d33" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "storage_members" ADD CONSTRAINT "FK_de17dd134dff0971de6b15f9d53" FOREIGN KEY ("space_id") REFERENCES "storage_spaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "storage_members" ADD CONSTRAINT "FK_191d681cb1f0d8afda0318de475" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "storage_spaces" ADD CONSTRAINT "FK_3f1d27993fa0897c6102d7815c8" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "media" ADD CONSTRAINT "FK_c6889397830b5ed0f2a30362065" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "media" ADD CONSTRAINT "FK_184389866e278877c4ab26ecd46" FOREIGN KEY ("cloudinary_account_id") REFERENCES "cloudinary_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "media" ADD CONSTRAINT "FK_893973bea729fa0678c4c658e49" FOREIGN KEY ("storage_space_id") REFERENCES "storage_spaces"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "album_media" ADD CONSTRAINT "FK_846915f9ddbc3350c2ea28b1989" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "album_media" ADD CONSTRAINT "FK_e846eea26bfbc6b3c3252a641a1" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "albums" ADD CONSTRAINT "FK_14dfb720709372ede2fc2e15859" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "albums" DROP CONSTRAINT "FK_14dfb720709372ede2fc2e15859"`);
        await queryRunner.query(`ALTER TABLE "album_media" DROP CONSTRAINT "FK_e846eea26bfbc6b3c3252a641a1"`);
        await queryRunner.query(`ALTER TABLE "album_media" DROP CONSTRAINT "FK_846915f9ddbc3350c2ea28b1989"`);
        await queryRunner.query(`ALTER TABLE "media" DROP CONSTRAINT "FK_893973bea729fa0678c4c658e49"`);
        await queryRunner.query(`ALTER TABLE "media" DROP CONSTRAINT "FK_184389866e278877c4ab26ecd46"`);
        await queryRunner.query(`ALTER TABLE "media" DROP CONSTRAINT "FK_c6889397830b5ed0f2a30362065"`);
        await queryRunner.query(`ALTER TABLE "storage_spaces" DROP CONSTRAINT "FK_3f1d27993fa0897c6102d7815c8"`);
        await queryRunner.query(`ALTER TABLE "storage_members" DROP CONSTRAINT "FK_191d681cb1f0d8afda0318de475"`);
        await queryRunner.query(`ALTER TABLE "storage_members" DROP CONSTRAINT "FK_de17dd134dff0971de6b15f9d53"`);
        await queryRunner.query(`ALTER TABLE "message_media" DROP CONSTRAINT "FK_4b57256212b997b5cdaf9941d33"`);
        await queryRunner.query(`ALTER TABLE "message_media" DROP CONSTRAINT "FK_5e876c5aff8c5304fb0dc2906a9"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_22133395bd13b970ccd0c34ab22"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23"`);
        await queryRunner.query(`ALTER TABLE "conversation_members" DROP CONSTRAINT "FK_a46c76be8f62c4b00a835cdc370"`);
        await queryRunner.query(`ALTER TABLE "conversation_members" DROP CONSTRAINT "FK_36340a1704b039608e34244511f"`);
        await queryRunner.query(`ALTER TABLE "cloudinary_accounts" DROP CONSTRAINT "FK_61466dc625be738211baf6d138e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0d4823e097ee3f1f6279807c87"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP INDEX "public"."idx_album_owner_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_14dfb720709372ede2fc2e1585"`);
        await queryRunner.query(`DROP TABLE "albums"`);
        await queryRunner.query(`DROP INDEX "public"."idx_album_media_album_added_at"`);
        await queryRunner.query(`DROP TABLE "album_media"`);
        await queryRunner.query(`DROP INDEX "public"."idx_media_owner_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_media_space_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_893973bea729fa0678c4c658e4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_184389866e278877c4ab26ecd4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c6889397830b5ed0f2a3036206"`);
        await queryRunner.query(`DROP TABLE "media"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3f1d27993fa0897c6102d7815c"`);
        await queryRunner.query(`DROP TABLE "storage_spaces"`);
        await queryRunner.query(`DROP INDEX "public"."idx_storage_member_user"`);
        await queryRunner.query(`DROP TABLE "storage_members"`);
        await queryRunner.query(`DROP TYPE "public"."storage_member_role"`);
        await queryRunner.query(`DROP TABLE "message_media"`);
        await queryRunner.query(`DROP INDEX "public"."idx_message_conversation_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_22133395bd13b970ccd0c34ab2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3bc55a7c3f9ed54b520bb5cfe2"`);
        await queryRunner.query(`DROP TABLE "messages"`);
        await queryRunner.query(`DROP TABLE "conversations"`);
        await queryRunner.query(`DROP INDEX "public"."idx_conversation_member_user"`);
        await queryRunner.query(`DROP TABLE "conversation_members"`);
        await queryRunner.query(`DROP INDEX "public"."uq_user_active_primary"`);
        await queryRunner.query(`DROP INDEX "public"."uq_user_active_secondary_slot"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_61466dc625be738211baf6d138"`);
        await queryRunner.query(`DROP TABLE "cloudinary_accounts"`);
        await queryRunner.query(`DROP TYPE "public"."cloudinary_account_role"`);
    }

}
