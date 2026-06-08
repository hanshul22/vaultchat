import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { configuration } from '../config/configuration';
import { envValidationSchema } from '../config/env.validation';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { HealthController } from '../health/health.controller';
import { EncryptionModule } from '../common/encryption/encryption.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryAccountsModule } from '../cloudinary-accounts/cloudinary-accounts.module';
import { VaultModule } from '../vault/vault.module';
import { UsersModule } from '../users/users.module';
import { MediaModule } from '../media/media.module';
import { AlbumsModule } from '../albums/albums.module';
import { StorageSpacesModule } from '../storage-spaces/storage-spaces.module';
import { ChatModule } from '../chat/chat.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
      cache: true,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('redis.host');
        const port = config.get<number>('redis.port');
        const username = config.get<string>('redis.username');
        const password = config.get<string>('redis.password');
        const tls = config.get<boolean>('redis.tls');

        return {
          connection: {
            host,
            port,
            username: username || undefined,
            password: password || undefined,
            maxRetriesPerRequest: null,
            tls: tls
              ? { rejectUnauthorized: false, servername: host }
              : undefined,
          },
        };
      },
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    EncryptionModule,
    CloudinaryModule,
    AuthModule,
    CloudinaryAccountsModule,
    VaultModule,
    UsersModule,
    MediaModule,
    AlbumsModule,
    StorageSpacesModule,
    ChatModule,
    JobsModule,
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 60000,
        limit: 20,
      },
    ]),
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
