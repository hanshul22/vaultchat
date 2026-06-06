import { CloudinaryAccountRole } from '../../cloudinary-accounts/entities/cloudinary-account.entity';

/**
 * The two deterministic rejection reasons defined by StorageModel.md §4 and
 * PRD §6.1. Returned verbatim by the preflight endpoint and embedded in the
 * 507 Insufficient Storage error body raised during a real upload.
 */
export enum PreflightRejectReason {
  /** The aggregate Vault free space is smaller than the file. */
  VAULT_FULL = 'VAULT_FULL',
  /**
   * The Vault has enough free space in aggregate, but no single Cloudinary
   * account has a contiguous slot large enough — and we never split a file
   * across accounts.
   */
  FILE_TOO_LARGE_FOR_ANY_ACCOUNT = 'FILE_TOO_LARGE_FOR_ANY_ACCOUNT',
}

/**
 * Shape returned by POST /api/v1/media/upload/preflight.
 *
 * All byte counts are serialised as strings to preserve bigint precision over
 * the JSON boundary (videos routinely exceed 2^53 bytes once limits grow).
 */
export interface PreflightResult {
  /** True when the file will be accepted by a real upload right now. */
  canUpload: boolean;

  // ── Present only when canUpload === true ──────────────────────────────────
  targetAccountId?: string;
  targetAccountRole?: CloudinaryAccountRole;
  targetSecondaryOrder?: number | null;

  // ── Present only when canUpload === false ─────────────────────────────────
  reason?: PreflightRejectReason;

  // ── Always-useful capacity hints (both branches) ──────────────────────────
  /** Free bytes on the single account with the most available room. */
  largestFreeSlotBytes?: string;
  /** Aggregate free bytes across all active accounts. */
  vaultFreeBytes?: string;
}
