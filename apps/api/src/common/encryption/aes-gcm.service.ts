import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * AES-256-GCM encryption service.
 *
 * Payload format (colon-separated base64):
 *   <iv_b64>:<authTag_b64>:<ciphertext_b64>
 *
 * Key source: AES_ENCRYPTION_KEY env var (base64-encoded, must decode to 32 bytes).
 */
@Injectable()
export class AesGcmService implements OnModuleInit {
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const rawKey = this.config.get<string>('encryption.key');

    if (!rawKey) {
      throw new Error(
        'AES_ENCRYPTION_KEY is not configured. ' +
          'Set a 32-byte key encoded as base64.',
      );
    }

    const keyBuffer = Buffer.from(rawKey, 'base64');

    if (keyBuffer.length !== 32) {
      throw new Error(
        `AES_ENCRYPTION_KEY must decode to exactly 32 bytes; got ${keyBuffer.length} byte(s). ` +
          'Generate a valid key with: openssl rand -base64 32',
      );
    }

    this.key = keyBuffer;
  }

  /**
   * Encrypts a plaintext string.
   * @returns Colon-separated base64 string: `<iv>:<authTag>:<ciphertext>`
   */
  encrypt(plainText: string): string {
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const ciphertext = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  /**
   * Decrypts a payload produced by {@link encrypt}.
   * @throws If the payload is malformed or authentication fails.
   */
  decrypt(payload: string): string {
    const parts = payload.split(':');

    if (parts.length !== 3) {
      throw new Error(
        'Invalid encrypted payload: expected format <iv>:<authTag>:<ciphertext>',
      );
    }

    const [ivB64, authTagB64, ciphertextB64] = parts as [string, string, string];

    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }
}
