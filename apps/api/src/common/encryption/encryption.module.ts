import { Global, Module } from '@nestjs/common';
import { AesGcmService } from './aes-gcm.service';

/**
 * Global encryption module.
 * Import once in AppModule; AesGcmService is then available app-wide.
 */
@Global()
@Module({
  providers: [AesGcmService],
  exports: [AesGcmService],
})
export class EncryptionModule {}
