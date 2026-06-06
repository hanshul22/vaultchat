import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CloudinaryAccount } from '../cloudinary-accounts/entities/cloudinary-account.entity';
import { Media } from './entities/media.entity';
import { MediaPart } from './entities/media-part.entity';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MagicByteValidator } from './magic-byte.validator';

/**
 * Phase 7 / Phase 9 media-upload backend core.
 *
 * Depends on the global CloudinaryModule (uploader) and EncryptionModule
 * (AES-GCM) for credential handling — both are @Global so they need no
 * explicit import here. Registers the Media, MediaPart, and CloudinaryAccount
 * repositories for the upload/reserve/list/delete flows.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Media, MediaPart, CloudinaryAccount])],
  controllers: [MediaController],
  providers: [MediaService, MagicByteValidator],
  exports: [MediaService],
})
export class MediaModule {}
