import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

import type { DatabaseConfig } from '../config/configuration';

// ── Explicit entity imports ──────────────────────────────────────────────────
// Never use glob discovery or autoLoadEntities. Every entity must be listed
// here so that both the Nest runtime and the TypeORM CLI share the same set.
import { Album } from '../albums/entities/album.entity';
import { AlbumMedia } from '../albums/entities/album-media.entity';
import { CloudinaryAccount } from '../cloudinary-accounts/entities/cloudinary-account.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { ConversationMember } from '../conversations/entities/conversation-member.entity';
import { Media } from '../media/entities/media.entity';
import { MediaPart } from '../media/entities/media-part.entity';
import { Message } from '../messages/entities/message.entity';
import { MessageMedia } from '../messages/entities/message-media.entity';
import { StorageMember } from '../storage-spaces/entities/storage-member.entity';
import { StorageSpace } from '../storage-spaces/entities/storage-space.entity';
import { User } from '../users/entities/user.entity';

// ── Single source of truth for entity registration ───────────────────────────
// Import this array in data-source.ts so the CLI uses exactly the same list.
export const ALL_ENTITIES = [
  Album,
  AlbumMedia,
  CloudinaryAccount,
  Conversation,
  ConversationMember,
  Media,
  MediaPart,
  Message,
  MessageMedia,
  StorageMember,
  StorageSpace,
  User,
] as const;

// ── Runtime config builder (Nest DI) ─────────────────────────────────────────
export const buildTypeOrmConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const db = configService.get<DatabaseConfig>('database');

  if (!db) {
    throw new Error('Database configuration is missing');
  }

  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.username,
    password: db.password,
    database: db.database,
    ssl: db.ssl ? { rejectUnauthorized: false } : false,

    entities: [...ALL_ENTITIES],

    migrations: [__dirname + '/migrations/*.{ts,js}'],
    migrationsTableName: 'typeorm_migrations',

    // Never auto-sync schema in any environment — always use migrations.
    synchronize: false,

    logging: ['error', 'warn'],
  };
};
