import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { AesGcmService } from '../../common/encryption/aes-gcm.service';
import { CloudinaryUploaderService } from '../../common/cloudinary/cloudinary-uploader.service';
import {
  CloudinaryAccount,
  CloudinaryAccountRole,
} from '../../cloudinary-accounts/entities/cloudinary-account.entity';
import { Media } from '../entities/media.entity';
import { PreflightRejectReason } from '../types/preflight-result.type';
import { DirectUploadService, DirectUploadSession } from './direct-upload.service';
import { InitDirectUploadDto } from './dto/init-direct-upload.dto';
import { SignPartDto } from './dto/sign-part.dto';
import { CompleteDirectUploadDto } from './dto/complete-direct-upload.dto';
import { AbortDirectUploadDto } from './dto/abort-direct-upload.dto';

// ─── Helpers ────────────────────────────────────────────────────────────────

const MB = 1024 * 1024;

const makeAccount = (
  overrides?: Partial<CloudinaryAccount>,
): CloudinaryAccount =>
  ({
    id: 'account-1',
    userId: 'user-1',
    cloudName: 'my-cloud',
    apiKey: 'key-abc',
    apiSecretEncrypted: 'enc-secret',
    role: CloudinaryAccountRole.PRIMARY,
    secondaryOrder: null,
    storageUsedBytes: '0',
    storageLimitBytes: String(100 * MB),
    isActive: true,
    lastReconciledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CloudinaryAccount);

const makeSession = (overrides?: Partial<DirectUploadSession>): DirectUploadSession => ({
  uploadId: 'upload-uuid-1',
  userId: 'user-1',
  accountId: 'account-1',
  mimeType: 'image/jpeg',
  filename: 'photo.jpg',
  fileSizeBytes: String(5 * MB),
  nextPartIndex: 0,
  partCount: 0,
  ...overrides,
});

// ─── Factory ─────────────────────────────────────────────────────────────────

interface MockDeps {
  accountRepo: jest.Mocked<Repository<CloudinaryAccount>>;
  dataSource: jest.Mocked<DataSource>;
  aesGcm: jest.Mocked<AesGcmService>;
  uploader: jest.Mocked<CloudinaryUploaderService>;
  redis: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
}

const makeService = (deps?: Partial<MockDeps>): { service: DirectUploadService; mocks: MockDeps } => {
  const account = makeAccount();

  // A minimal EntityManager that satisfies the service's transactional usage.
  const makeManager = (): Partial<EntityManager> => {
    const accountRepoInTx: Partial<Repository<CloudinaryAccount>> = {
      findOne: jest.fn().mockResolvedValue(account),
      save: jest.fn().mockImplementation((a: CloudinaryAccount) => Promise.resolve(a)),
    };
    const mediaRepoInTx: Partial<Repository<Media>> = {
      create: jest.fn().mockImplementation((data: Partial<Media>) => data as Media),
      save: jest.fn().mockImplementation((m: Media) =>
        Promise.resolve({ ...m, id: 'new-media-id', createdAt: new Date(), updatedAt: new Date() }),
      ),
    };

    return {
      createQueryBuilder: jest.fn().mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([account]),
      }),
      getRepository: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === CloudinaryAccount) return accountRepoInTx;
        if (entity === Media) return mediaRepoInTx;
        throw new Error('Unknown entity in mock getRepository');
      }),
    };
  };

  const mocks: MockDeps = {
    accountRepo: {
      findOne: jest.fn().mockResolvedValue(account),
    } as unknown as jest.Mocked<Repository<CloudinaryAccount>>,

    dataSource: {
      transaction: jest.fn().mockImplementation(
        async <T>(cb: (manager: EntityManager) => Promise<T>): Promise<T> =>
          cb(makeManager() as EntityManager),
      ),
    } as unknown as jest.Mocked<DataSource>,

    aesGcm: {
      decrypt: jest.fn().mockReturnValue('plain-secret'),
    } as unknown as jest.Mocked<AesGcmService>,

    uploader: {
      signUploadParams: jest.fn().mockReturnValue({ signature: 'sig-abc', timestamp: 1700000000 }),
      buildDeliveryUrl: jest.fn().mockReturnValue('https://res.cloudinary.com/my-cloud/image/upload/photo'),
      destroy: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<CloudinaryUploaderService>,

    redis: {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    },

    ...deps,
  };

  const service = new DirectUploadService(
    mocks.accountRepo,
    mocks.dataSource,
    mocks.aesGcm,
    mocks.uploader,
    mocks.redis as never,
  );

  return { service, mocks };
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DirectUploadService', () => {
  // ── 1. initUpload — happy path ─────────────────────────────────────────────
  it('1. initUpload — happy path: returns uploadId + uploadUrl + signed fields, stores session', async () => {
    const { service, mocks } = makeService();

    const dto: InitDirectUploadDto = {
      fileSizeBytes: 5 * MB,
      mimeType: 'image/jpeg',
      filename: 'photo.jpg',
    };

    const result = await service.initUpload('user-1', dto);

    // Returns a non-empty uploadId and a base uploadUrl (no query params).
    expect(result.uploadId).toBeTruthy();
    expect(typeof result.uploadId).toBe('string');
    expect(result.uploadUrl).toContain('api.cloudinary.com');
    expect(result.uploadUrl).not.toContain('signature=');
    expect(result.uploadUrl).not.toContain('api_key=');
    expect(result.cloudName).toBe('my-cloud');

    // All signed fields are returned as discrete values.
    expect(result.apiKey).toBe('key-abc');
    expect(typeof result.timestamp).toBe('number');
    expect(result.signature).toBe('sig-abc');
    expect(result.folder).toContain('user-1');
    expect(result.publicId).toContain('__part_0');
    expect(result.resourceType).toBe('image');

    // Session was stored in Redis with 2-hour TTL.
    expect(mocks.redis.set).toHaveBeenCalledTimes(1);
    const [key, value, exFlag, ttl] = mocks.redis.set.mock.calls[0] as [string, string, string, number];
    expect(key).toMatch(/^direct-upload-session:/);
    const session: DirectUploadSession = JSON.parse(value);
    expect(session.userId).toBe('user-1');
    expect(session.accountId).toBe('account-1');
    expect(session.mimeType).toBe('image/jpeg');
    expect(session.nextPartIndex).toBe(1);
    expect(session.partCount).toBe(1);
    expect(exFlag).toBe('EX');
    expect(ttl).toBe(7200);
  });

  // ── 2. initUpload — vault full: throws 507 ─────────────────────────────────
  it('2. initUpload — vault full: throws 507', async () => {
    // Account has 0 free bytes.
    const fullAccount = makeAccount({
      storageUsedBytes: String(100 * MB),
      storageLimitBytes: String(100 * MB),
    });

    const { service } = makeService({
      dataSource: {
        transaction: jest.fn().mockImplementation(
          async <T>(cb: (manager: EntityManager) => Promise<T>): Promise<T> => {
            const manager: Partial<EntityManager> = {
              createQueryBuilder: jest.fn().mockReturnValue({
                setLock: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                addOrderBy: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([fullAccount]),
              }),
              getRepository: jest.fn().mockReturnValue({
                findOne: jest.fn().mockResolvedValue(fullAccount),
                save: jest.fn().mockImplementation((a: CloudinaryAccount) => Promise.resolve(a)),
              }),
            };
            return cb(manager as EntityManager);
          },
        ),
      } as unknown as jest.Mocked<DataSource>,
    });

    const dto: InitDirectUploadDto = {
      fileSizeBytes: 5 * MB,
      mimeType: 'image/jpeg',
      filename: 'photo.jpg',
    };

    const error = await service.initUpload('user-1', dto).catch((err) => err);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.INSUFFICIENT_STORAGE);
    const body = (error as HttpException).getResponse() as Record<string, unknown>;
    expect(body['reason']).toBe(PreflightRejectReason.VAULT_FULL);
  });

  // ── 3. signNextPart — out-of-order partIndex: throws 409 ──────────────────
  it('3. signNextPart — out-of-order partIndex: throws 409', async () => {
    const session = makeSession({ nextPartIndex: 1 });

    const { service } = makeService({
      redis: {
        get: jest.fn().mockResolvedValue(JSON.stringify(session)),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
      },
    });

    const dto: SignPartDto = {
      uploadId: 'upload-uuid-1',
      partIndex: 2, // Wrong — expected 1
    };

    const error = await service.signNextPart('user-1', dto).catch((err) => err);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
  });

  // ── 3b. signNextPart — happy path: returns structured signed fields ────────
  it('3b. signNextPart — happy path: returns uploadUrl + signed fields for correct part', async () => {
    const session = makeSession({ nextPartIndex: 1 });

    const { service, mocks } = makeService({
      redis: {
        get: jest.fn().mockResolvedValue(JSON.stringify(session)),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
      },
    });

    const dto: SignPartDto = { uploadId: 'upload-uuid-1', partIndex: 1 };
    const result = await service.signNextPart('user-1', dto);

    expect(result.uploadUrl).toContain('api.cloudinary.com');
    expect(result.uploadUrl).not.toContain('signature=');
    expect(result.apiKey).toBe('key-abc');
    expect(result.signature).toBe('sig-abc');
    expect(result.publicId).toContain('__part_1');
    expect(result.resourceType).toBe('image');
    expect(result.folder).toContain('user-1');

    // signUploadParams was called with folder and part-index-aware public_id.
    expect(mocks.uploader.signUploadParams).toHaveBeenCalledWith(
      expect.objectContaining({ cloudName: 'my-cloud', apiKey: 'key-abc' }),
      expect.objectContaining({ folder: expect.stringContaining('user-1'), public_id: expect.stringContaining('__part_1') }),
    );
  });

  // ── 4. signNextPart — wrong userId: throws 403 ────────────────────────────
  it('4. signNextPart — wrong userId: throws 403', async () => {
    const session = makeSession({ userId: 'user-1' });

    const { service } = makeService({
      redis: {
        get: jest.fn().mockResolvedValue(JSON.stringify(session)),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
      },
    });

    const dto: SignPartDto = {
      uploadId: 'upload-uuid-1',
      partIndex: 0,
    };

    await expect(service.signNextPart('intruder-user', dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  // ── 5. completeUpload — happy path: Media record written, Redis cleared ────
  it('5. completeUpload — happy path: Media record written, Redis cleared', async () => {
    const session = makeSession();

    const { service, mocks } = makeService({
      redis: {
        get: jest.fn().mockResolvedValue(JSON.stringify(session)),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
      },
    });

    const dto: CompleteDirectUploadDto = {
      uploadId: 'upload-uuid-1',
      cloudinaryPublicId: 'vaultchat/user-1/photo',
      finalSizeBytes: 4 * MB,
      width: 1920,
      height: 1080,
    };

    const result = await service.completeUpload('user-1', dto);

    // A Media entity was returned.
    expect(result).toBeDefined();
    expect(result.id).toBe('new-media-id');

    // Redis session was deleted.
    expect(mocks.redis.del).toHaveBeenCalledWith('direct-upload-session:upload-uuid-1');

    // Transaction was invoked (for DB write + byte adjustment).
    expect(mocks.dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  // ── 6. abortUpload — session not found: returns silently (idempotent) ─────
  it('6. abortUpload — session not found: returns silently (idempotent)', async () => {
    const { service, mocks } = makeService({
      redis: {
        get: jest.fn().mockResolvedValue(null), // Session expired / already deleted
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(0),
      },
    });

    const dto: AbortDirectUploadDto = { uploadId: 'upload-uuid-gone' };

    // Should resolve without throwing.
    await expect(service.abortUpload('user-1', dto)).resolves.toBeUndefined();

    // No DB transaction or Cloudinary calls.
    expect(mocks.dataSource.transaction).not.toHaveBeenCalled();
    expect(mocks.uploader.destroy).not.toHaveBeenCalled();
  });

  // ── 7. abortUpload — Cloudinary abort throws: does NOT rethrow ────────────
  it('7. abortUpload — Cloudinary abort throws: does NOT rethrow', async () => {
    const session = makeSession();

    const { service } = makeService({
      redis: {
        get: jest.fn().mockResolvedValue(JSON.stringify(session)),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
      },
      uploader: {
        signUploadParams: jest.fn().mockReturnValue({ signature: 'sig', timestamp: 1700000000 }),
        buildDeliveryUrl: jest.fn().mockReturnValue('https://res.cloudinary.com/...'),
        destroy: jest.fn().mockRejectedValue(new Error('Cloudinary is down')),
      } as unknown as jest.Mocked<CloudinaryUploaderService>,
    });

    const dto: AbortDirectUploadDto = { uploadId: 'upload-uuid-1' };

    // Must resolve — Cloudinary error must NOT be rethrown.
    await expect(service.abortUpload('user-1', dto)).resolves.toBeUndefined();
  });
});
