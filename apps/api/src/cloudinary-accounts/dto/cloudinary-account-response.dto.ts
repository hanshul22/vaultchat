import { CloudinaryAccount, CloudinaryAccountRole } from '../entities/cloudinary-account.entity';

/**
 * Safe public representation of a Cloudinary account.
 *
 * - apiSecretEncrypted (and the raw secret) are never included.
 * - apiKey is masked: only the last 4 characters are visible
 *   (e.g. "••••••••••••3f9a") to let the user identify the key
 *   without exposing the full value.
 */
export class CloudinaryAccountResponseDto {
  id: string;
  userId: string;
  cloudName: string;
  /** Masked API key — last 4 characters only, prefixed with bullets. */
  apiKeyMasked: string;
  role: CloudinaryAccountRole;
  secondaryOrder: number | null;
  storageUsedBytes: string;
  storageLimitBytes: string;
  isActive: boolean;
  lastReconciledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(account: CloudinaryAccount) {
    this.id = account.id;
    this.userId = account.userId;
    this.cloudName = account.cloudName;
    this.apiKeyMasked = CloudinaryAccountResponseDto.maskApiKey(account.apiKey);
    this.role = account.role;
    this.secondaryOrder = account.secondaryOrder;
    this.storageUsedBytes = account.storageUsedBytes;
    this.storageLimitBytes = account.storageLimitBytes;
    this.isActive = account.isActive;
    this.lastReconciledAt = account.lastReconciledAt;
    this.createdAt = account.createdAt;
    this.updatedAt = account.updatedAt;
  }

  /** Shows only the last 4 chars; pads with bullets up to a fixed width. */
  private static maskApiKey(apiKey: string): string {
    const visible = apiKey.slice(-4);
    return `${'•'.repeat(12)}${visible}`;
  }
}
