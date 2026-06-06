import { Global, Module } from '@nestjs/common';
import { CloudinaryVerifierService } from './cloudinary-verifier.service';
import { CloudinaryUploaderService } from './cloudinary-uploader.service';

/**
 * Global Cloudinary utility module.
 * Import once in AppModule; the verifier and uploader services are then
 * available app-wide for account creation, re-verification, health checks,
 * and media upload/destroy operations.
 */
@Global()
@Module({
  providers: [CloudinaryVerifierService, CloudinaryUploaderService],
  exports: [CloudinaryVerifierService, CloudinaryUploaderService],
})
export class CloudinaryModule {}
