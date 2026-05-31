/**
 * The two rejection reasons the backend returns verbatim in the preflight
 * response and in 507 error bodies (StorageModel.md §4, PRD §6.1).
 *
 * Mirrors PreflightRejectReason from the Phase 7 backend — kept as a plain
 * string union so the frontend has no dependency on the NestJS enum.
 */
export type PreflightRejectReason = 'VAULT_FULL' | 'FILE_TOO_LARGE_FOR_ANY_ACCOUNT';

/**
 * Typed response from POST /api/v1/media/upload/preflight.
 *
 * Matches the PreflightResult interface from Phase 7 exactly.
 * All byte counts are strings (BIGINT-safe over JSON).
 */
export interface MediaUploadPreflightResponse {
  /** True when the file will be accepted by a real upload right now. */
  canUpload: boolean;

  // ── Present only when canUpload === true ──────────────────────────────────

  /** UUID of the Cloudinary account that will receive the file. */
  targetAccountId?: string;

  /**
   * Role of the target account: "primary" or "secondary".
   * Matches the CloudinaryAccountRole enum values from the backend.
   */
  targetAccountRole?: 'primary' | 'secondary';

  /**
   * Secondary slot number (1 or 2) when the target is a secondary account;
   * null when the target is the primary.
   */
  targetSecondaryOrder?: number | null;

  // ── Present only when canUpload === false ─────────────────────────────────

  /** Machine-readable rejection reason. */
  reason?: PreflightRejectReason;

  // ── Always-useful capacity hints (both branches) ──────────────────────────

  /** Free bytes on the single account with the most available room (string). */
  largestFreeSlotBytes?: string;

  /** Aggregate free bytes across all active Vault accounts (string). */
  vaultFreeBytes?: string;
}

/**
 * Request body sent to POST /api/v1/media/upload/preflight.
 * Matches UploadPreflightDto from Phase 7.
 */
export interface PreflightRequest {
  /** File size in bytes (integer). Must be ≥ 1 and ≤ 104_857_600 (100 MB). */
  fileSizeBytes: number;
  /** Declared MIME type, e.g. "image/jpeg". */
  mimeType: string;
}
