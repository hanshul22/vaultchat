import { CloudinaryAccountRole } from '../../cloudinary-accounts/entities/cloudinary-account.entity';
import { PreflightRejectReason } from '../types/preflight-result.type';
import { SelectableAccount } from '../types/media-upload-target.type';
import { orderAccountsForFill, selectAccountForUpload } from './cloudinary-account-selector';

/** 1 GiB in bytes — the unit StorageModel.md §11 worked examples speak in. */
const GiB = BigInt(1024 ** 3);

/** Builds a primary account with `usedGiB`/`limitGiB` capacity. */
const primary = (usedGiB: number, limitGiB = 25): SelectableAccount => ({
  id: 'primary',
  role: CloudinaryAccountRole.PRIMARY,
  secondaryOrder: null,
  storageUsedBytes: (BigInt(usedGiB) * GiB).toString(),
  storageLimitBytes: (BigInt(limitGiB) * GiB).toString(),
});

/** Builds a secondary account in slot `order` with `usedGiB`/`limitGiB`. */
const secondary = (order: 1 | 2, usedGiB: number, limitGiB = 25): SelectableAccount => ({
  id: `secondary-${order}`,
  role: CloudinaryAccountRole.SECONDARY,
  secondaryOrder: order,
  storageUsedBytes: (BigInt(usedGiB) * GiB).toString(),
  storageLimitBytes: (BigInt(limitGiB) * GiB).toString(),
});

describe('CloudinaryAccountSelector (StorageModel.md §11 worked examples)', () => {
  describe('Example A — Primary has room, small file', () => {
    it('routes a 2 GB file to the Primary when P=10/25, S1=0/25', () => {
      const accounts = [primary(10), secondary(1, 0)];

      const outcome = selectAccountForUpload(accounts, 2n * GiB);

      expect(outcome.reason).toBeNull();
      expect(outcome.account?.id).toBe('primary');
      expect(outcome.account?.role).toBe(CloudinaryAccountRole.PRIMARY);
      // Vault free = P(15) + S1(25) = 40 GiB; largest single slot = 25 GiB.
      expect(outcome.vaultFreeBytes).toBe((40n * GiB).toString());
      expect(outcome.largestFreeSlotBytes).toBe((25n * GiB).toString());
    });
  });

  describe('Example B — Primary full, Secondary-1 has room', () => {
    it('routes a 4 GB file to Secondary-1 when P=25/25, S1=3/25', () => {
      const accounts = [primary(25), secondary(1, 3)];

      const outcome = selectAccountForUpload(accounts, 4n * GiB);

      expect(outcome.reason).toBeNull();
      expect(outcome.account?.id).toBe('secondary-1');
      expect(outcome.account?.role).toBe(CloudinaryAccountRole.SECONDARY);
      expect(outcome.account?.secondaryOrder).toBe(1);
    });
  });

  describe('Example C — File larger than any single slot', () => {
    it('rejects an 8 GB file with FILE_TOO_LARGE_FOR_ANY_ACCOUNT (P=20/25, S1=22/25, S2=23/25)', () => {
      const accounts = [primary(20), secondary(1, 22), secondary(2, 23)];

      const outcome = selectAccountForUpload(accounts, 8n * GiB);

      expect(outcome.account).toBeNull();
      expect(outcome.reason).toBe(PreflightRejectReason.FILE_TOO_LARGE_FOR_ANY_ACCOUNT);
      // Aggregate free = 5 + 3 + 2 = 10 GiB; largest single slot = 5 GiB.
      expect(outcome.vaultFreeBytes).toBe((10n * GiB).toString());
      expect(outcome.largestFreeSlotBytes).toBe((5n * GiB).toString());
    });
  });

  describe('Example D — Vault full', () => {
    it('rejects a 1 MB file with VAULT_FULL when P=25/25, S1=25/25, S2=25/25', () => {
      const accounts = [primary(25), secondary(1, 25), secondary(2, 25)];
      const oneMb = 1024n * 1024n;

      const outcome = selectAccountForUpload(accounts, oneMb);

      expect(outcome.account).toBeNull();
      expect(outcome.reason).toBe(PreflightRejectReason.VAULT_FULL);
      expect(outcome.vaultFreeBytes).toBe('0');
      expect(outcome.largestFreeSlotBytes).toBe('0');
    });
  });

  describe('strict sequential fill ordering', () => {
    it('orders Primary → Secondary-1 → Secondary-2 regardless of input order', () => {
      const shuffled = [secondary(2, 0), primary(0), secondary(1, 0)];

      const ordered = orderAccountsForFill(shuffled);

      expect(ordered.map((a) => a.id)).toEqual(['primary', 'secondary-1', 'secondary-2']);
    });

    it('does not mutate the input array', () => {
      const input = [secondary(1, 0), primary(0)];
      const snapshot = input.map((a) => a.id);

      orderAccountsForFill(input);

      expect(input.map((a) => a.id)).toEqual(snapshot);
    });

    it('prefers the Primary even when a later secondary also fits', () => {
      const accounts = [primary(10), secondary(1, 0)];

      const outcome = selectAccountForUpload(accounts, 5n * GiB);

      expect(outcome.account?.id).toBe('primary');
    });

    it('skips a Primary that is exactly full and lands on Secondary-1', () => {
      const accounts = [primary(25), secondary(1, 0)];

      const outcome = selectAccountForUpload(accounts, 1n * GiB);

      expect(outcome.account?.id).toBe('secondary-1');
    });
  });

  describe('edge cases', () => {
    it('treats a file that exactly fills the remaining slot as a fit', () => {
      const accounts = [primary(20)]; // 5 GiB free

      const outcome = selectAccountForUpload(accounts, 5n * GiB);

      expect(outcome.reason).toBeNull();
      expect(outcome.account?.id).toBe('primary');
    });

    it('rejects with VAULT_FULL when there are no accounts at all', () => {
      const outcome = selectAccountForUpload([], 1n);

      expect(outcome.account).toBeNull();
      expect(outcome.reason).toBe(PreflightRejectReason.VAULT_FULL);
      expect(outcome.vaultFreeBytes).toBe('0');
    });

    it('accepts a zero-byte file into the Primary', () => {
      const accounts = [primary(0)];

      const outcome = selectAccountForUpload(accounts, 0n);

      expect(outcome.reason).toBeNull();
      expect(outcome.account?.id).toBe('primary');
    });
  });
});
