import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CloudinaryAccount } from '../cloudinary-accounts/entities/cloudinary-account.entity';
import { Media } from './entities/media.entity';
import { MediaPart } from './entities/media-part.entity';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { DirectUploadController } from './direct-upload/direct-upload.controller';
import { DirectUploadService } from './direct-upload/direct-upload.service';

/**
 * Phase 12 direct-upload media backend.
 *
 * Binary uploads go browser → Cloudinary directly via signed URLs.
 * The API only handles preflight, init, sign-part, complete, and abort
 * endpoints, plus media listing, retrieval, and deletion.
 *
 * Depends on the global CloudinaryModule (uploader) and EncryptionModule
 * (AES-GCM) for credential handling — both are @Global so they need no
 * explicit import here. Registers the Media, MediaPart, and CloudinaryAccount
 * repositories for the upload/reserve/list/delete flows.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Media, MediaPart, CloudinaryAccount])],
  controllers: [MediaController, DirectUploadController],
  providers: [MediaService, DirectUploadService],
  exports: [MediaService],
})
export class MediaModule {}
