import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import {
  CloudinaryAccount,
  CloudinaryAccountRole,
} from '../cloudinary-accounts/entities/cloudinary-account.entity';
import { AesGcmService } from '../common/encryption/aes-gcm.service';
import { CloudinaryUploaderService } from '../common/cloudinary/cloudinary-uploader.service';
import { MediaService } from './media.service';
import { Media, MediaUploadStatus } from './entities/media.entity';
import { MediaPart } from './entities/media-part.entity';
import { PreflightRejectReason } from './types/preflight-result.type';

const MB = 1024 * 1024;

type FakeAccount = {
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
};

type FakeMedia = {
  id: string;
  ownerId: string;
  cloudinaryAccountId: string;
  storageSpaceId: string | null;
  cloudinaryPublicId: string;
  url: string;
  mimeType: string;
  sizeBytes: string;
  width: number | null;
  height: number | null;
  durationSeconds: string | null;
  isOrphaned: boolean;
  isMultipart: boolean;
  totalParts: number;
  uploadStatus: MediaUploadStatus;
  createdAt: Date;
  updatedAt: Date;
};

type FakeMediaPart = {
  id: string;
  mediaId: string;
  partIndex: number;
  totalParts: number;
  cloudinaryPublicId: string;
  cloudName: string;
  sizeBytes: string;
  cloudinaryAccountId: string;
  mimeType: string;
  createdAt: Date;
};

interface FakeDb {
  accounts: FakeAccount[];
  media: FakeMedia[];
  parts: FakeMediaPart[];
}

const clone = <T>(value: T): T => structuredClone(value);

const sortAccounts = (accounts: FakeAccount[]): FakeAccount[] =>
  [...accounts].sort((a, b) => {
    if (a.role !== b.role) {
      return a.role === CloudinaryAccountRole.PRIMARY ? -1 : 1;
    }
    return (
      (a.secondaryOrder ?? Number.MAX_SAFE_INTEGER) - (b.secondaryOrder ?? Number.MAX_SAFE_INTEGER)
    );
  });

const createAccountRepo = (db: FakeDb) =>
  ({
    find: jest.fn(async ({ where }: { where?: Partial<FakeAccount> } = {}) =>
      db.accounts
        .filter((account) => {
          if (!where) return true;
          return Object.entries(where).every(
            ([key, value]) => account[key as keyof FakeAccount] === value,
          );
        })
        .map((account) => clone(account)),
    ),
    findOne: jest.fn(async ({ where }: { where: Partial<FakeAccount> }) => {
      const row = db.accounts.find((account) =>
        Object.entries(where).every(
          ([key, value]) => account[key as keyof FakeAccount] === value,
        ),
      );
      return row ? clone(row) : null;
    }),
    save: jest.fn(async (input: CloudinaryAccount | CloudinaryAccount[]) => {
      const rows = Array.isArray(input) ? input : [input];
      for (const row of rows as unknown as FakeAccount[]) {
        const index = db.accounts.findIndex((account) => account.id === row.id);
        if (index >= 0) db.accounts[index] = clone(row);
      }
      return input;
    }),
  }) as unknown as Repository<CloudinaryAccount>;

const createMediaRepo = (db: FakeDb) =>
  ({
    create: jest.fn((input: Partial<Media>) => input as Media),
    findOne: jest.fn(async ({ where }: { where: Partial<FakeMedia> }) => {
      const row = db.media.find((media) =>
        Object.entries(where).every(([key, value]) => media[key as keyof FakeMedia] === value),
      );
      return row ? clone(row) : null;
    }),
    save: jest.fn(async (input: Media | Media[]) => {
      const rows = Array.isArray(input) ? input : [input];
      const saved = rows.map((row) => {
        const cast = row as unknown as FakeMedia;
        const next: FakeMedia = {
          ...cast,
          createdAt: cast.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: cast.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
        };
        const existingIndex = db.media.findIndex((media) => media.id === next.id);
        if (existingIndex >= 0) {
          db.media[existingIndex] = clone(next);
        } else {
          db.media.push(clone(next));
        }
        return clone(next) as unknown as Media;
      });
      return Array.isArray(input) ? saved : saved[0]!;
    }),
    delete: jest.fn(async ({ id }: { id: string }) => {
      db.media = db.media.filter((media) => media.id !== id);
      return { affected: 1 };
    }),
    createQueryBuilder: jest.fn(),
  }) as unknown as Repository<Media>;

const createMediaPartRepo = (db: FakeDb) =>
  ({
    create: jest.fn((input: Partial<MediaPart>) => input as MediaPart),
    find: jest.fn(
      async ({
        where,
        order,
      }: {
        where?: Partial<FakeMediaPart>;
        order?: { partIndex?: 'ASC' | 'DESC' };
      } = {}) => {
        let rows = db.parts.filter((part) => {
          if (!where) return true;
          return Object.entries(where).every(
            ([key, value]) => part[key as keyof FakeMediaPart] === value,
          );
        });
        if (order?.partIndex) {
          rows = [...rows].sort((a, b) =>
            order.partIndex === 'ASC' ? a.partIndex - b.partIndex : b.partIndex - a.partIndex,
          );
        }
        return rows.map((row) => clone(row));
      },
    ),
    findOne: jest.fn(async ({ where }: { where: Partial<FakeMediaPart> }) => {
      const row = db.parts.find((part) =>
        Object.entries(where).every(([key, value]) => part[key as keyof FakeMediaPart] === value),
      );
      return row ? clone(row) : null;
    }),
    save: jest.fn(async (input: MediaPart | MediaPart[]) => {
      const rows = Array.isArray(input) ? input : [input];
      const saved = rows.map((row) => {
        const cast = row as unknown as FakeMediaPart;
        const next: FakeMediaPart = {
          ...cast,
          id: cast.id ?? `part-${db.parts.length + 1}`,
          createdAt: cast.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
        };
        const existingIndex = db.parts.findIndex(
          (part) => part.mediaId === next.mediaId && part.partIndex === next.partIndex,
        );
        if (existingIndex >= 0) {
          db.parts[existingIndex] = clone(next);
        } else {
          db.parts.push(clone(next));
        }
        return clone(next) as unknown as MediaPart;
      });
      return Array.isArray(input) ? saved : saved[0]!;
    }),
    delete: jest.fn(async ({ mediaId }: { mediaId: string }) => {
      db.parts = db.parts.filter((part) => part.mediaId !== mediaId);
      return { affected: 1 };
    }),
  }) as unknown as Repository<MediaPart>;

const createManager = (db: FakeDb) => ({
  createQueryBuilder: jest.fn(() => {
    let filterUserId: string | undefined;
    const qb: {
      setLock: jest.Mock;
      where: jest.Mock;
      andWhere: jest.Mock;
      orderBy: jest.Mock;
      addOrderBy: jest.Mock;
      getMany: jest.Mock;
    } = {
      setLock: jest.fn(() => qb),
      where: jest.fn((_sql: string, params?: { userId?: string }) => {
        filterUserId = params?.userId;
        return qb;
      }),
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      addOrderBy: jest.fn(() => qb),
      getMany: jest.fn(async () =>
        sortAccounts(
          db.accounts.filter(
            (account) => account.isActive && (!filterUserId || account.userId === filterUserId),
          ),
        ).map((account) => clone(account)),
      ),
    };
    return qb;
  }),
  getRepository: jest.fn((entity: unknown) => {
    if (entity === CloudinaryAccount) return createAccountRepo(db);
    if (entity === Media) return createMediaRepo(db);
    if (entity === MediaPart) return createMediaPartRepo(db);
    throw new Error('Unsupported repository');
  }),
});

const makeService = (seed?: Partial<FakeDb>) => {
  const db: FakeDb = {
    accounts: seed?.accounts ? clone(seed.accounts) : [],
    media: seed?.media ? clone(seed.media) : [],
    parts: seed?.parts ? clone(seed.parts) : [],
  };

  const mediaRepo = createMediaRepo(db);
  const mediaPartRepo = createMediaPartRepo(db);
  const accountRepo = createAccountRepo(db);
  const dataSource = {
    transaction: jest.fn(
      async <T>(cb: (manager: ReturnType<typeof createManager>) => Promise<T>): Promise<T> =>
        cb(createManager(db)),
    ),
  } as unknown as DataSource;
  const aesGcm = { decrypt: jest.fn(() => 'decrypted-secret') } as unknown as AesGcmService;
  const uploader = {
    signUploadParams: jest.fn((_creds: unknown, params: Record<string, string>) => ({
      signature: `sig:${params.public_id ?? 'unknown'}`,
      timestamp: 1717171717,
    })),
    buildDeliveryUrl: jest.fn(
      (cloudName: string, resourceType: string, publicId: string) =>
        `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${publicId}`,
    ),
    destroy: jest.fn(async () => true),
  } as unknown as CloudinaryUploaderService;

  const service = new MediaService(
    mediaRepo,
    mediaPartRepo,
    accountRepo,
    dataSource,
    aesGcm,
    uploader,
  );

  return { service, db, uploader };
};

const account = (
  id: string,
  role: CloudinaryAccountRole,
  usedMb: number,
  limitMb: number,
  secondaryOrder: number | null,
): FakeAccount => ({
  id,
  userId: 'user-1',
  role,
  secondaryOrder,
  storageUsedBytes: String(usedMb * MB),
  storageLimitBytes: String(limitMb * MB),
  isActive: true,
  cloudName: `cloud-${id}`,
  apiKey: `key-${id}`,
  apiSecretEncrypted: `enc-${id}`,
});

const uploadingMedia = (overrides?: Partial<FakeMedia>): FakeMedia => ({
  id: '11111111-1111-4111-8111-111111111111',
  ownerId: 'user-1',
  cloudinaryAccountId: 'primary',
  storageSpaceId: null,
  cloudinaryPublicId: 'vaultchat/user-1/11111111-1111-4111-8111-111111111111__part_0',
  url: 'https://res.cloudinary.com/cloud-primary/image/upload/vaultchat/user-1/11111111-1111-4111-8111-111111111111__part_0',
  mimeType: 'image/jpeg',
  sizeBytes: String(8 * MB),
  width: null,
  height: null,
  durationSeconds: null,
  isOrphaned: false,
  isMultipart: true,
  totalParts: 3,
  uploadStatus: MediaUploadStatus.UPLOADING,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('MediaService direct upload contract', () => {
  it('returns preflight success with cloudName and uploadFolder', async () => {
    const { service } = makeService({
      accounts: [
        account('primary', CloudinaryAccountRole.PRIMARY, 10, 100, null),
        account('secondary-1', CloudinaryAccountRole.SECONDARY, 0, 100, 1),
      ],
    });

    const result = await service.preflight('user-1', 2 * MB, 'image/jpeg');

    expect(result).toMatchObject({
      canUpload: true,
      cloudName: 'cloud-primary',
      uploadFolder: 'vaultchat/user-1',
      targetAccountId: 'primary',
      targetAccountRole: CloudinaryAccountRole.PRIMARY,
    });
  });

  it('reserves totalFileSize and creates an uploading media row on direct-upload-init', async () => {
    const { service, db, uploader } = makeService({
      accounts: [account('primary', CloudinaryAccountRole.PRIMARY, 10, 100, null)],
    });

    const result = await service.directUploadInit('user-1', {
      mediaId: '11111111-1111-4111-8111-111111111111',
      totalFileSize: 8 * MB,
      totalParts: 3,
      mimeType: 'image/jpeg',
    });

    expect(result).toMatchObject({
      uploadId: '11111111-1111-4111-8111-111111111111',
      cloudName: 'cloud-primary',
      apiKey: 'key-primary',
      signature: 'sig:11111111-1111-4111-8111-111111111111__part_0',
      folder: 'vaultchat/user-1',
      publicIdPattern: '11111111-1111-4111-8111-111111111111__part_{partIndex}',
    });
    expect((uploader.signUploadParams as jest.Mock)).toHaveBeenCalledTimes(1);
    expect(db.accounts[0]!.storageUsedBytes).toBe(String(18 * MB));
    expect(db.media[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      uploadStatus: MediaUploadStatus.UPLOADING,
      sizeBytes: String(8 * MB),
      totalParts: 3,
      cloudinaryAccountId: 'primary',
    });
  });

  it('rejects direct-upload-init when the file cannot fit any single account', async () => {
    const { service, db } = makeService({
      accounts: [
        account('primary', CloudinaryAccountRole.PRIMARY, 95, 100, null),
        account('secondary-1', CloudinaryAccountRole.SECONDARY, 97, 100, 1),
        account('secondary-2', CloudinaryAccountRole.SECONDARY, 98, 100, 2),
      ],
    });

    const error = await service
      .directUploadInit('user-1', {
        mediaId: '22222222-2222-4222-8222-222222222222',
        totalFileSize: 8 * MB,
        totalParts: 2,
        mimeType: 'image/jpeg',
      })
      .catch((err) => err);

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.INSUFFICIENT_STORAGE);
    expect(error.getResponse().reason).toBe(PreflightRejectReason.FILE_TOO_LARGE_FOR_ANY_ACCOUNT);
    expect(db.media).toHaveLength(0);
  });

  it('only signs additional parts for uploading media', async () => {
    const { service } = makeService({
      accounts: [account('primary', CloudinaryAccountRole.PRIMARY, 18, 100, null)],
      media: [uploadingMedia({ uploadStatus: MediaUploadStatus.READY })],
    });

    await expect(
      service.directUploadSignPart('user-1', {
        mediaId: '11111111-1111-4111-8111-111111111111',
        partIndex: 1,
        totalParts: 3,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('persists media_parts and adjusts reserved bytes on direct-upload-complete', async () => {
    const { service, db, uploader } = makeService({
      accounts: [account('primary', CloudinaryAccountRole.PRIMARY, 18, 100, null)],
      media: [uploadingMedia()],
    });

    const result = await service.directUploadComplete('user-1', {
      mediaId: '11111111-1111-4111-8111-111111111111',
      parts: [
        { partIndex: 0, publicId: 'vaultchat/user-1/part-0', sizeBytes: 2 * MB },
        { partIndex: 1, publicId: 'vaultchat/user-1/part-1', sizeBytes: 2 * MB },
        { partIndex: 2, publicId: 'vaultchat/user-1/part-2', sizeBytes: 2 * MB },
      ],
      compressedTotalBytes: 6 * MB,
    });

    expect(result.sizeBytes).toBe(String(6 * MB));
    expect(db.media[0]).toMatchObject({
      uploadStatus: MediaUploadStatus.READY,
      sizeBytes: String(6 * MB),
      isMultipart: true,
      cloudinaryPublicId: 'vaultchat/user-1/part-0',
    });
    expect(db.parts).toHaveLength(3);
    expect(db.accounts[0]!.storageUsedBytes).toBe(String(16 * MB));
    expect((uploader.buildDeliveryUrl as jest.Mock)).toHaveBeenCalledWith(
      'cloud-primary',
      'image',
      'vaultchat/user-1/part-0',
    );
  });

  it('rolls back the reservation and deletes uploaded parts on direct-upload-abort', async () => {
    const { service, db, uploader } = makeService({
      accounts: [account('primary', CloudinaryAccountRole.PRIMARY, 18, 100, null)],
      media: [uploadingMedia()],
      parts: [
        {
          id: 'part-existing',
          mediaId: '11111111-1111-4111-8111-111111111111',
          partIndex: 0,
          totalParts: 3,
          cloudinaryPublicId: 'vaultchat/user-1/part-0',
          cloudName: 'cloud-primary',
          sizeBytes: String(2 * MB),
          cloudinaryAccountId: 'primary',
          mimeType: 'image/jpeg',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });

    const result = await service.directUploadAbort('user-1', {
      mediaId: '11111111-1111-4111-8111-111111111111',
      uploadedParts: [
        { publicId: 'vaultchat/user-1/part-0' },
        { publicId: 'vaultchat/user-1/part-1' },
      ],
    });

    expect(result).toEqual({ success: true });
    expect(db.accounts[0]!.storageUsedBytes).toBe(String(10 * MB));
    expect(db.media[0]!.uploadStatus).toBe(MediaUploadStatus.FAILED);
    expect(db.parts).toHaveLength(0);
    expect((uploader.destroy as jest.Mock)).toHaveBeenCalledTimes(2);
  });
});
