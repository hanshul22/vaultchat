import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RootConfig } from '../config/configuration';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService<RootConfig, true>) {}

  async sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    const from = this.configService.get('mail.from', { infer: true });
    const apiKey = this.configService.get('mail.apiKey', { infer: true });

    const resetLink = `http://localhost:4200/reset-password?token=${resetToken}`;

    const body = JSON.stringify({
      from,
      to,
      subject: 'Reset your password',
      html: `
        <p>You requested a password reset.</p>
        <p>Click the link below to set a new password. This link expires in 30 minutes.</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>If you did not request this, you can safely ignore this email.</p>
      `.trim(),
    });

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '(no body)');
      this.logger.error(`Mail provider returned ${response.status}: ${errorText}`);
      throw new Error(`Mail provider error: ${response.status}`);
    }
  }
}