import { CloudinaryAccountRole } from '../../cloudinary-accounts/entities/cloudinary-account.entity';
import { PreflightRejectReason } from '../types/preflight-result.type';
import { SelectableAccount, SelectionOutcome } from '../types/media-upload-target.type';

/**
 * Pure account-selection logic for the Unified Vault (StorageModel.md §4, §11).
 *
 * This module is intentionally free of NestJS, TypeORM, and I/O so it can be
 * unit-tested in isolation against the four worked examples in StorageModel.md
 * §11. The upload service supplies the (already DB-loaded) accounts and the
 * file size; the selector decides where the file goes — or why it can't.
 *
 * Strict sequential fill: Primary → Secondary-1 → Secondary-2. Never
 * round-robin, never split a file across accounts.
 */

/** Canonical fill order: primary first (weight 0), then secondaries by slot. */
const roleWeight = (role: CloudinaryAccountRole): number =>
  role === CloudinaryAccountRole.PRIMARY ? 0 : 1;

/**
 * Returns a new array sorted into the deterministic fill order:
 * Primary → Secondary-1 → Secondary-2.
 *
 * The input is not mutated. A null/large secondaryOrder sorts last so the
 * order is stable even if data is slightly malformed.
 */
export const orderAccountsForFill = (accounts: readonly SelectableAccount[]): SelectableAccount[] =>
  [...accounts].sort((a, b) => {
    const w = roleWeight(a.role) - roleWeight(b.role);
    if (w !== 0) return w;
    return (
      (a.secondaryOrder ?? Number.MAX_SAFE_INTEGER) - (b.secondaryOrder ?? Number.MAX_SAFE_INTEGER)
    );
  });

/** Free bytes on a single account, floored at zero. */
const freeBytes = (account: SelectableAccount): bigint => {
  const limit = BigInt(account.storageLimitBytes);
  const used = BigInt(account.storageUsedBytes);
  return limit > used ? limit - used : 0n;
};

/**
 * Selects the Cloudinary account that should receive a file of `fileSizeBytes`,
 * applying the strict sequential-fill rule.
 *
 * Algorithm (StorageModel.md §4):
 *   1. Order accounts: Primary → Secondary-1 → Secondary-2.
 *   2. vaultFree = Σ(limit − used). If file > vaultFree → VAULT_FULL.
 *   3. First account (in fill order) with free ≥ file wins.
 *   4. If none fits but vaultFree ≥ file → FILE_TOO_LARGE_FOR_ANY_ACCOUNT.
 *
 * @param accounts      Active accounts only — the caller filters is_active.
 * @param fileSizeBytes Incoming file size in bytes (bigint).
 * @returns A {@link SelectionOutcome}: either a chosen account or a reason,
 *          always with the capacity hints populated.
 */
export const selectAccountForUpload = (
  accounts: readonly SelectableAccount[],
  fileSizeBytes: bigint,
): SelectionOutcome => {
  const ordered = orderAccountsForFill(accounts);

  // ── Compute capacity hints in a single pass ───────────────────────────────
  let vaultFree = 0n;
  let largestFree = 0n;
  for (const account of ordered) {
    const free = freeBytes(account);
    vaultFree += free;
    if (free > largestFree) largestFree = free;
  }

  const hints = {
    largestFreeSlotBytes: largestFree.toString(),
    vaultFreeBytes: vaultFree.toString(),
  };

  // ── Step 2 — aggregate Vault cannot hold the file at all ──────────────────
  // Covers Example D (Vault full) and any case where total free < file.
  if (fileSizeBytes > vaultFree) {
    return {
      account: null,
      reason: PreflightRejectReason.VAULT_FULL,
      ...hints,
    };
  }

  // ── Step 3 — first account in fill order with room wins ───────────────────
  // Covers Example A (Primary has room) and Example B (Primary full → S1).
  for (const account of ordered) {
    if (freeBytes(account) >= fileSizeBytes) {
      return { account, reason: null, ...hints };
    }
  }

  // ── Step 4 — fits in aggregate, but no single slot is big enough ──────────
  // Covers Example C: a file cannot be split across accounts.
  return {
    account: null,
    reason: PreflightRejectReason.FILE_TOO_LARGE_FOR_ANY_ACCOUNT,
    ...hints,
  };
};
