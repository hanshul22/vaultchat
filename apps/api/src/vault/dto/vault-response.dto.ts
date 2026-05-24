import { CloudinaryAccountRole } from '../../cloudinary-accounts/entities/cloudinary-account.entity';

/**
 * Per-account breakdown line inside the Vault response.
 * All byte values are serialised as strings to preserve bigint precision
 * across JSON boundaries.
 */
export class VaultAccountDto {
  id!: string;
  cloudName!: string;
  role!: CloudinaryAccountRole;
  secondaryOrder!: number | null;
  /** Bytes already consumed on this account. */
  usedBytes!: string;
  /** Total storage limit for this account. */
  limitBytes!: string;
  /** limitBytes − usedBytes (floor 0). */
  freeBytes!: string;
  /** 0–100, rounded to 2 decimal places. */
  percentUsed!: number;
  /** True when freeBytes === "0". */
  isFull!: boolean;
}

/**
 * Unified Vault view returned by GET /api/v1/vault.
 *
 * Totals aggregate all active accounts; bytes are strings (bigint-safe).
 */
export class VaultResponseDto {
  /** Sum of usedBytes across all active accounts. */
  usedBytes!: string;
  /** Sum of limitBytes across all active accounts. */
  limitBytes!: string;
  /** limitBytes − usedBytes (floor 0). */
  freeBytes!: string;
  /** Free bytes on the single account with the most available space. */
  largestFreeSlotBytes!: string;
  /** 0–100, rounded to 2 decimal places. */
  percentUsed!: number;
  /** Ordered: Primary → Secondary-1 → Secondary-2. */
  accounts!: VaultAccountDto[];
}
