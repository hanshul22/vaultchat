import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { StorageSpacesModule } from '../storage-spaces/storage-spaces.module';
import { ChatModule } from '../chat/chat.module';

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
    DatabaseModule,
    RedisModule,
    EncryptionModule,
    CloudinaryModule,
    AuthModule,
    CloudinaryAccountsModule,
    VaultModule,
    UsersModule,
    StorageSpacesModule,
    ChatModule,
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
