import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** Stub — full implementation comes in a later phase. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
