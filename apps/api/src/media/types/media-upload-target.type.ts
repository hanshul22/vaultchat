import { CloudinaryAccountRole } from '../../cloudinary-accounts/entities/cloudinary-account.entity';
import { PreflightRejectReason } from './preflight-result.type';

/**
 * Minimal projection of a CloudinaryAccount that the selector needs to make a
 * placement decision. Keeping it narrow lets the selector stay a pure function
 * that is trivial to unit-test without a database — callers pass plain objects.
 *
 * Byte fields are strings because they originate from BIGINT columns (TypeORM
 * maps bigint → string). The selector parses them into BigInt internally.
 */
export interface SelectableAccount {
  id: string;
  role: CloudinaryAccountRole;
  /** 1 or 2 for secondaries; null for the primary. */
  secondaryOrder: number | null;
  /** Bytes already consumed (BIGINT as string). */
  storageUsedBytes: string;
  /** Total capacity in bytes (BIGINT as string). */
  storageLimitBytes: string;
}

/**
 * Outcome of running {@link CloudinaryAccountSelector.select}.
 *
 * Exactly one of `account` (success) or `reason` (rejection) is populated.
 * `largestFreeSlotBytes` and `vaultFreeBytes` are always provided so the
 * caller can build both the success payload and the honest 507 messages
 * without re-walking the account list.
 */
export interface SelectionOutcome {
  /** The chosen account on success; null when rejected. */
  account: SelectableAccount | null;
  /** Populated only when `account` is null. */
  reason: PreflightRejectReason | null;
  /** max(limit − used) across all active accounts, as a string. */
  largestFreeSlotBytes: string;
  /** Σ(limit − used) across all active accounts, as a string. */
  vaultFreeBytes: string;
}
