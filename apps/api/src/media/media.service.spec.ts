import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import {
  CloudinaryAccount,
  CloudinaryAccountRole,
} from '../cloudinary-accounts/entities/cloudinary-account.entity';
import { Media } from './entities/media.entity';
import { MediaService, UploadedFile } from './media.service';
import { MagicByteValidator } from './magic-byte.validator';
import { AesGcmService } from '../common/encryption/aes-gcm.service';
import { CloudinaryUploaderService } from '../common/cloudinary/cloudinary-uploader.service';
import { PreflightRejectReason } from './types/preflight-result.type';

/** 1 GiB in bytes. */
const GiB = BigInt(1024 ** 3);

interface FakeAccount {
  id: string;
  userId: string;
  role: CloudinaryAccountRole;
  secondaryOrder: number | null;
  storageUsedBytes: string;
  storageLimitBytes: string;
  isActive: boolean;
  cloudName: string;
  apiKey: string;
  apiSecretEncrypted: string;
}

/** Mutable in-memory store standing in for the cloudinary_accounts table. */
class FakeDb {
  accounts: FakeAccount[] = [];
  /** Serialises transactions to model `SELECT … FOR UPDATE` row locking. */
  lock: Promise<unknown> = Promise.resolve();
}

/** Applies a TypeORM raw-SQL `set` fragment to a fake row. */
const applySql = (target: FakeAccount, sql: string): void => {
  const plus = sql.match(/storage_used_bytes \+ (\d+)/);
  if (plus) {
    target.storageUsedBytes = (BigInt(target.storageUsedBytes) + BigInt(plus[1]!)).toString();
    return;
  }
  const minus = sql.match(/storage_used_bytes - (\d+)/);
  if (minus) {
    const next = BigInt(target.storageUsedBytes) - BigInt(minus[1]!);
    target.storageUsedBytes = (next > 0n ? next : 0n).toString();
  }
};

/** Builds a chainable query-builder mock backed by the fake DB. */
const makeQueryBuilder = (db: FakeDb) => {
  let whereId: string | null = null;
  let setFn: (() => string) | null = null;

  const qb: Record<string, unknown> = {
    setLock: () => qb,
    where: (_cond: string, params?: Record<string, unknown>) => {
      if (params && typeof params['id'] === 'string') {
        whereId = params['id'] as string;
      }
      return qb;
    },
    andWhere: () => qb,
    orderBy: () => qb,
    addOrderBy: () => qb,
    getMany: async (): Promise<FakeAccount[]> =>
      db.accounts.filter((a) => a.isActive).map((a) => ({ ...a })),
    update: () => qb,
    set: (obj: { storageUsedBytes: () => string }) => {
      setFn = obj.storageUsedBytes;
      return qb;
    },
    execute: async () => {
      const target = db.accounts.find((a) => a.id === whereId);
      if (target && setFn) applySql(target, setFn());
      return { affected: target ? 1 : 0 };
    },
  };
  return qb;
};

/** Wires a MediaService with controllable mocks around the fake DB. */
const makeService = (accounts: FakeAccount[]) => {
  const db = new FakeDb();
  db.accounts = accounts;

  const accountRepo = {
    find: async () => db.accounts.filter((a) => a.isActive).map((a) => ({ ...a })),
    findOne: async ({ where }: { where: { id: string } }) =>
      db.accounts.find((a) => a.id === where.id) ?? null,
    createQueryBuilder: () => makeQueryBuilder(db),
  } as unknown as Repository<CloudinaryAccount>;

  const savedRows: Media[] = [];
  const mediaRepo = {
    create: (input: Partial<Media>) => ({ ...input }) as Media,
    save: async (input: Media) => {
      const row = {
        ...input,
        id: `media-${savedRows.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Media;
      savedRows.push(row);
      return row;
    },
    createQueryBuilder: () => makeQueryBuilder(db),
  } as unknown as Repository<Media>;

  const dataSource = {
    transaction: jest.fn(async <T>(cb: (manager: unknown) => Promise<T>): Promise<T> => {
      const manager = {
        createQueryBuilder: () => makeQueryBuilder(db),
        delete: jest.fn(async () => ({ affected: 1 })),
      };
      const result = db.lock.then(() => cb(manager));
      db.lock = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }),
  } as unknown as DataSource;

  const aesGcm = {
    decrypt: jest.fn(() => 'decrypted-secret'),
  } as unknown as AesGcmService;

  const uploader = {
    upload: jest.fn(async () => ({
      publicId: 'vaultchat/user/abc123',
      url: 'https://res.cloudinary.com/demo/image/upload/abc123.jpg',
      bytes: 1024,
      width: 800,
      height: 600,
      durationSeconds: null,
      resourceType: 'image',
    })),
    destroy: jest.fn(async () => true),
  } as unknown as CloudinaryUploaderService;

  const magicBytes = {
    detect: jest.fn(async () => ({ ext: 'jpg', mime: 'image/jpeg' })),
  } as unknown as MagicByteValidator;

  const service = new MediaService(
    mediaRepo,
    accountRepo,
    dataSource,
    aesGcm,
    uploader,
    magicBytes,
  );

  return { service, db, uploader, magicBytes, aesGcm, savedRows };
};

/** Convenience account factories (sizes expressed in GiB). */
const primary = (usedGiB: number, limitGiB = 25): FakeAccount => ({
  id: 'primary',
  userId: 'user-1',
  role: CloudinaryAccountRole.PRIMARY,
  secondaryOrder: null,
  storageUsedBytes: (BigInt(usedGiB) * GiB).toString(),
  storageLimitBytes: (BigInt(limitGiB) * GiB).toString(),
  isActive: true,
  cloudName: 'cloud-primary',
  apiKey: 'key-primary',
  apiSecretEncrypted: 'enc-primary',
});

const secondary = (order: 1 | 2, usedGiB: number, limitGiB = 25): FakeAccount => ({
  id: `secondary-${order}`,
  userId: 'user-1',
  role: CloudinaryAccountRole.SECONDARY,
  secondaryOrder: order,
  storageUsedBytes: (BigInt(usedGiB) * GiB).toString(),
  storageLimitBytes: (BigInt(limitGiB) * GiB).toString(),
  isActive: true,
  cloudName: `cloud-secondary-${order}`,
  apiKey: `key-secondary-${order}`,
  apiSecretEncrypted: `enc-secondary-${order}`,
});

/** Builds a fake uploaded JPEG of `sizeBytes`. */
const jpegFile = (sizeBytes: number): UploadedFile => ({
  originalname: 'photo.jpg',
  mimetype: 'image/jpeg',
  size: sizeBytes,
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
});

/** 1 MB in bytes. */
const MB = 1024 * 1024;

/**
 * Byte-scale account factories for the upload-path tests. The real upload caps
 * files at 100 MB (PRD §6.1), so these tests use MB-sized capacities — small
 * enough that a ≤ 100 MB file can fill or overflow a slot, exercising the same
 * selector branches as the GiB-scale worked examples.
 */
const primaryMb = (usedMb: number, limitMb: number): FakeAccount => ({
  ...primary(0),
  storageUsedBytes: (usedMb * MB).toString(),
  storageLimitBytes: (limitMb * MB).toString(),
});

const secondaryMb = (order: 1 | 2, usedMb: number, limitMb: number): FakeAccount => ({
  ...secondary(order, 0),
  storageUsedBytes: (usedMb * MB).toString(),
  storageLimitBytes: (limitMb * MB).toString(),
});

describe('MediaService', () => {
  describe('preflight', () => {
    it('returns canUpload + target account when the Primary has room', async () => {
      const { service } = makeService([primary(10), secondary(1, 0)]);

      const result = await service.preflight('user-1', 2 * 1024 ** 3, 'image/jpeg');

      expect(result.canUpload).toBe(true);
      expect(result.targetAccountId).toBe('primary');
      expect(result.targetAccountRole).toBe(CloudinaryAccountRole.PRIMARY);
      expect(result.vaultFreeBytes).toBe((40n * GiB).toString());
    });

    it('rejects an unsupported MIME type with 415', async () => {
      const { service } = makeService([primary(0)]);

      await expect(service.preflight('user-1', 1024, 'application/pdf')).rejects.toBeInstanceOf(
        UnsupportedMediaTypeException,
      );
    });

    it('reports VAULT_FULL without consuming quota', async () => {
      const accounts = [primary(25), secondary(1, 25)];
      const { service, db } = makeService(accounts);

      const result = await service.preflight('user-1', 1024, 'image/jpeg');

      expect(result.canUpload).toBe(false);
      expect(result.reason).toBe(PreflightRejectReason.VAULT_FULL);
      // Quota untouched.
      expect(db.accounts[0]!.storageUsedBytes).toBe((25n * GiB).toString());
    });
  });

  describe('upload — happy path', () => {
    it('reserves quota, uploads, and persists the media row', async () => {
      // Primary: 10 MB used of 100 MB.
      const { service, db, uploader, savedRows } = makeService([primaryMb(10, 100)]);

      const dto = await service.upload('user-1', jpegFile(1 * MB));

      expect(uploader.upload).toHaveBeenCalledTimes(1);
      expect(dto.id).toBe('media-1');
      expect(dto.ownerId).toBe('user-1');
      expect(dto.mimeType).toBe('image/jpeg');
      // Primary went from 10 MB → 11 MB used.
      expect(db.accounts[0]!.storageUsedBytes).toBe((11 * MB).toString());
      // Never leaks the account id to the client surface.
      expect(savedRows[0]!.cloudinaryAccountId).toBe('primary');
      expect(dto).not.toHaveProperty('cloudinaryAccountId');
    });

    it('routes to Secondary-1 when the Primary is full', async () => {
      // Primary full (100/100 MB); Secondary-1 at 3/100 MB.
      const { service, db } = makeService([primaryMb(100, 100), secondaryMb(1, 3, 100)]);

      const dto = await service.upload('user-1', jpegFile(4 * MB));

      expect(dto.id).toBe('media-1');
      // Primary untouched, Secondary-1 incremented 3 MB → 7 MB.
      expect(db.accounts[0]!.storageUsedBytes).toBe((100 * MB).toString());
      expect(db.accounts[1]!.storageUsedBytes).toBe((7 * MB).toString());
    });
  });

  describe('upload — rejections', () => {
    it('rejects oversized files with 413 before touching Cloudinary', async () => {
      const { service, uploader } = makeService([primary(0)]);
      const tooBig = 101 * 1024 * 1024; // 101 MB > 100 MB cap

      await expect(service.upload('user-1', jpegFile(tooBig))).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
      expect(uploader.upload).not.toHaveBeenCalled();
    });

    it('rejects a disallowed declared MIME type with 415', async () => {
      const { service, uploader } = makeService([primary(0)]);
      const file: UploadedFile = {
        originalname: 'doc.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
      };

      await expect(service.upload('user-1', file)).rejects.toBeInstanceOf(
        UnsupportedMediaTypeException,
      );
      expect(uploader.upload).not.toHaveBeenCalled();
    });

    it('rejects when magic bytes do not match the declared type (415)', async () => {
      const { service, magicBytes, uploader } = makeService([primary(0)]);
      // Declared image/jpeg, but content sniffs as a video.
      (magicBytes.detect as jest.Mock).mockResolvedValueOnce({
        ext: 'mp4',
        mime: 'video/mp4',
      });

      await expect(service.upload('user-1', jpegFile(1024))).rejects.toBeInstanceOf(
        UnsupportedMediaTypeException,
      );
      expect(uploader.upload).not.toHaveBeenCalled();
    });

    it('rejects with 507 VAULT_FULL when the Vault has no room', async () => {
      const { service, uploader } = makeService([primaryMb(100, 100), secondaryMb(1, 100, 100)]);

      const error = await service.upload('user-1', jpegFile(1 * MB)).catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(HttpStatus.INSUFFICIENT_STORAGE);
      expect(error.getResponse().reason).toBe(PreflightRejectReason.VAULT_FULL);
      expect(uploader.upload).not.toHaveBeenCalled();
    });

    it('rejects with 507 FILE_TOO_LARGE_FOR_ANY_ACCOUNT when no single slot fits', async () => {
      // Aggregate free = 5+3+2 = 10 MB, but largest slot = 5 MB < 8 MB file.
      const { service, uploader } = makeService([
        primaryMb(95, 100),
        secondaryMb(1, 97, 100),
        secondaryMb(2, 98, 100),
      ]);

      const error = await service.upload('user-1', jpegFile(8 * MB)).catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(HttpStatus.INSUFFICIENT_STORAGE);
      expect(error.getResponse().reason).toBe(PreflightRejectReason.FILE_TOO_LARGE_FOR_ANY_ACCOUNT);
      expect(uploader.upload).not.toHaveBeenCalled();
    });

    it('rolls back the reservation when the Cloudinary upload fails', async () => {
      const { service, db, uploader } = makeService([primaryMb(10, 100)]);
      (uploader.upload as jest.Mock).mockRejectedValueOnce(new Error('cloudinary down'));

      await expect(service.upload('user-1', jpegFile(1 * MB))).rejects.toBeInstanceOf(
        HttpException,
      );

      // Reserved 1 MB then compensated back to the original 10 MB.
      expect(db.accounts[0]!.storageUsedBytes).toBe((10 * MB).toString());
    });
  });

  describe('upload — concurrency (row-lock prevents overfill)', () => {
    it('does not overfill a single account under N parallel uploads', async () => {
      // Primary holds exactly 10 one-byte files; no secondary.
      const tinyPrimary: FakeAccount = {
        ...primary(0),
        storageUsedBytes: '0',
        storageLimitBytes: '10',
      };
      const { service, db } = makeService([tinyPrimary]);

      const oneByteFile = (): UploadedFile => ({
        originalname: 'x.jpg',
        mimetype: 'image/jpeg',
        size: 1,
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      });

      const attempts = 25;
      const results = await Promise.allSettled(
        Array.from({ length: attempts }, () => service.upload('user-1', oneByteFile())),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly the capacity (10) succeed; the rest are rejected with 507.
      expect(fulfilled).toHaveLength(10);
      expect(rejected).toHaveLength(attempts - 10);
      for (const r of rejected as PromiseRejectedResult[]) {
        expect(r.reason).toBeInstanceOf(HttpException);
        expect(r.reason.getStatus()).toBe(HttpStatus.INSUFFICIENT_STORAGE);
      }

      // The account is filled exactly to its limit — never beyond.
      expect(BigInt(db.accounts[0]!.storageUsedBytes)).toBeLessThanOrEqual(10n);
      expect(db.accounts[0]!.storageUsedBytes).toBe('10');
    });
  });
});
