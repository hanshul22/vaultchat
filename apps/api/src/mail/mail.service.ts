import { Injectable, Logger } from '@nestjs/common';

/** Stub — full mail service implementation comes in a later phase. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendPasswordResetEmail(): Promise<void> {
    this.logger.warn('MailService.sendPasswordResetEmail is not yet implemented');
  }
}
