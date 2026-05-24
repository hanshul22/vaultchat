import { Global, Module } from '@nestjs/common';
import { CloudinaryVerifierService } from './cloudinary-verifier.service';

/**
 * Global Cloudinary utility module.
 * Import once in AppModule; CloudinaryVerifierService is then available
 * app-wide for account creation, re-verification, and health checks.
 */
@Global()
@Module({
  providers: [CloudinaryVerifierService],
  exports: [CloudinaryVerifierService],
})
export class CloudinaryModule {}
