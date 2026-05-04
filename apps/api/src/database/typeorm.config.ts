import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DatabaseConfig } from '../config/configuration';
import { User } from '../users/entities/user.entity';
import { CloudinaryAccount } from '../cloudinary-accounts/entities/cloudinary-account.entity';
import { Media } from '../media/entities/media.entity';
import { Album } from '../albums/entities/album.entity';
import { AlbumMedia } from '../albums/entities/album-media.entity';
import { StorageSpace } from '../storage-spaces/entities/storage-space.entity';
import { StorageMember } from '../storage-spaces/entities/storage-member.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { ConversationMember } from '../conversations/entities/conversation-member.entity';
import { Message } from '../messages/entities/message.entity';
import { MessageMedia } from '../messages/entities/message-media.entity';

export const ALL_ENTITIES = [
  User,
  CloudinaryAccount,
  Media,
  Album,
  AlbumMedia,
  StorageSpace,
  StorageMember,
  Conversation,
  ConversationMember,
  Message,
  MessageMedia,
];

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
    entities: ALL_ENTITIES,
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    logging: ['error', 'warn'],
  };
};
