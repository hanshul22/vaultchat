import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Redis } from 'ioredis';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { AesGcmService } from '../../common/encryption/aes-gcm.service';
import { CloudinaryUploaderService } from '../../common/cloudinary/cloudinary-uploader.service';
import { CloudinaryAccount } from '../../cloudinary-accounts/entities/cloudinary-account.entity';
import { Media, MediaUploadStatus } from '../entities/media.entity';
import { selectAccountForUpload } from '../selectors/cloudinary-account-selector';
import { SelectableAccount } from '../types/media-upload-target.type';
import { PreflightRejectReason } from '../types/preflight-result.type';
import {
  isAllowedMimeType,
  ALLOWED_MIME_TYPES,
  DIRECT_UPLOAD_FOLDER_ROOT,
  resourceTypeForMime,
} from '../media.constants';
import { InitDirectUploadDto } from './dto/init-direct-upload.dto';
import { SignPartDto } from './dto/sign-part.dto';
import { CompleteDirectUploadDto } from './dto/complete-direct-upload.dto';
import { AbortDirectUploadDto } from './dto/abort-direct-upload.dto';

/** Redis key prefix for direct-upload sessions. */
const SESSION_KEY = (uploadId: string) => `direct-upload-session:${uploadId}`;
/** 2-hour TTL in seconds. */
const SESSION_TTL_SECONDS = 2 * 60 * 60;

/**
 * Shape persisted in Redis for one upload session.
 * All byte values stored as strings (bigint-safe over JSON).
 */
export interface DirectUploadSession {
  uploadId: string;
  userId: string;
  /** The Cloudinary account that owns all parts of this upload. */
  accountId: string;
  mimeType: string;
  filename: string;
  /** Reserved size in bytes (as string). */
  fileSizeBytes: string;
  nextPartIndex: number;
  partCount: number;
}

export interface InitUploadResponse {
  uploadId: string;
  /** Base Cloudinary upload endpoint — no signed params embedded. */
  uploadUrl: string;
  cloudName: string;
  resourceType: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
}

export interface SignPartResponse {
  /** Base Cloudinary upload endpoint — no signed params embedded. */
  uploadUrl: string;
  cloudName: string;
  resourceType: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
}

/**
 * Direct-upload service — Redis-session-based browser-to-Cloudinary upload flow.
 *
 * Session lifecycle:
 *   1. initUpload   → picks account, stores Redis session (2 h TTL), reserves bytes
 *   2. signNextPart → enforces sequential part order, re-signs URLs
 *   3. completeUpload → writes Media row to Postgres, clears session
 *   4. abortUpload  → releases reservation, best-effort Cloudinary cleanup
 *
 * SECURITY: api_secret, api_key, and apiSecretEncrypted are NEVER returned.
 */
@Injectable()
export class DirectUploadService {
  private readonly logger = new Logger(DirectUploadService.name);

  constructor(
    @InjectRepository(CloudinaryAccount)
    private readonly accountRepo: Repository<CloudinaryAccount>,
    private readonly dataSource: DataSource,
    private readonly aesGcm: AesGcmService,
    private readonly uploader: CloudinaryUploaderService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Init
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Starts a new upload session.
   *
   * - Runs the same sequential-fill preflight as the existing MediaService.
   * - Generates a server-side uploadId (never client-supplied).
   * - Reserves fileSizeBytes against account.storageUsedBytes.
   * - Stores the session in Redis with a 2-hour TTL.
   * - Returns a signed upload URL and the cloud name.
   */
  async initUpload(userId: string, dto: InitDirectUploadDto): Promise<InitUploadResponse> {
    this.assertAllowedMimeType(dto.mimeType);

    // Select account inside a transaction with a pessimistic lock so two
    // concurrent init calls don't both think the same account has capacity.
    const { account, uploadId } = await this.dataSource.transaction(async (manager) => {
      const accounts = await this.loadLockedAccounts(manager, userId);

      const selectable: SelectableAccount[] = accounts.map((acc) => ({
        id: acc.id,
        role: acc.role,
        secondaryOrder: acc.secondaryOrder,
        storageUsedBytes: acc.storageUsedBytes,
        storageLimitBytes: acc.storageLimitBytes,
      }));

      const outcome = selectAccountForUpload(selectable, BigInt(dto.fileSizeBytes));

      if (!outcome.account) {
        throw this.buildInsufficientStorageException(
          outcome.reason ?? PreflightRejectReason.VAULT_FULL,
          outcome.largestFreeSlotBytes,
          outcome.vaultFreeBytes,
        );
      }

      const chosen = accounts.find((acc) => acc.id === outcome.account!.id)!;

      // Reserve bytes atomically within the same transaction.
      await this.adjustAccountUsage(manager, chosen.id, BigInt(dto.fileSizeBytes));

      return { account: chosen, uploadId: randomUUID() };
    });

    // Sign the first URL (part 0) outside the transaction — no DB writes.
    const signedFields = await this.generateSignedUrl(
      account,
      uploadId,
      dto.mimeType,
      userId,
      0,
    );

    // Persist the session to Redis with a 2-hour TTL.
    const session: DirectUploadSession = {
      uploadId,
      userId,
      accountId: account.id,
      mimeType: dto.mimeType,
      filename: dto.filename,
      fileSizeBytes: String(dto.fileSizeBytes),
      nextPartIndex: 1,
      partCount: 1,
    };

    await this.redis.set(
      SESSION_KEY(uploadId),
      JSON.stringify(session),
      'EX',
      SESSION_TTL_SECONDS,
    );

    this.logger.log(
      `Direct-upload session created: uploadId=${uploadId} userId=${userId} accountId=${account.id}`,
    );

    return { uploadId, ...signedFields };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Sign next part
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Signs the URL for the next sequential chunk.
   *
   * Enforces strict part ordering: `dto.partIndex` must equal
   * `session.nextPartIndex` — out-of-order requests are rejected with 409.
   */
  async signNextPart(userId: string, dto: SignPartDto): Promise<SignPartResponse> {
    const session = await this.requireSession(dto.uploadId);
    this.assertSessionOwner(session, userId);

    if (dto.partIndex !== session.nextPartIndex) {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: `Expected partIndex ${session.nextPartIndex}, received ${dto.partIndex}. Parts must be signed sequentially.`,
        },
        HttpStatus.CONFLICT,
      );
    }

    const account = await this.requireAccount(session.accountId);
    const signedFields = await this.generateSignedUrl(
      account,
      dto.uploadId,
      session.mimeType,
      session.userId,
      dto.partIndex,
    );

    // Advance the session counters and refresh TTL.
    const updated: DirectUploadSession = {
      ...session,
      nextPartIndex: session.nextPartIndex + 1,
      partCount: session.partCount + 1,
    };

    await this.redis.set(
      SESSION_KEY(dto.uploadId),
      JSON.stringify(updated),
      'EX',
      SESSION_TTL_SECONDS,
    );

    return signedFields;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Complete
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Finalises an upload session.
   *
   * - Writes a Media record to Postgres.
   * - Atomically swaps reserved bytes for actual bytes on the account.
   * - Deletes the Redis session.
   */
  async completeUpload(userId: string, dto: CompleteDirectUploadDto): Promise<Media> {
    const session = await this.requireSession(dto.uploadId);
    this.assertSessionOwner(session, userId);

    const reservedBytes = BigInt(session.fileSizeBytes);
    const finalBytes = BigInt(dto.finalSizeBytes);

    const saved = await this.dataSource.transaction(async (manager) => {
      const account = await this.requireAccount(session.accountId);

      // Build a canonical delivery URL for the primary public_id.
      const resourceType = resourceTypeForMime(session.mimeType);
      const deliveryUrl = this.uploader.buildDeliveryUrl(
        account.cloudName,
        resourceType,
        dto.cloudinaryPublicId,
      );

      const mediaRepo = manager.getRepository(Media);
      const media = mediaRepo.create({
        ownerId: userId,
        cloudinaryAccountId: session.accountId,
        storageSpaceId: null,
        cloudinaryPublicId: dto.cloudinaryPublicId,
        url: deliveryUrl,
        mimeType: session.mimeType,
        sizeBytes: String(finalBytes),
        width: dto.width ?? null,
        height: dto.height ?? null,
        durationSeconds: dto.duration ?? null,
        isOrphaned: false,
        isMultipart: false,
        totalParts: 1,
        uploadStatus: MediaUploadStatus.READY,
      });

      const result = await mediaRepo.save(media);

      // Atomically: release reserved bytes, charge actual bytes.
      const delta = finalBytes - reservedBytes;
      await this.adjustAccountUsage(manager, session.accountId, delta);

      return result;
    });

    // Clear the Redis session after successful DB commit.
    await this.redis.del(SESSION_KEY(dto.uploadId));

    this.logger.log(
      `Direct-upload completed: uploadId=${dto.uploadId} userId=${userId} ` +
        `mediaId=${saved.id} finalBytes=${finalBytes.toString()}`,
    );

    return saved;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Abort
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Aborts an upload session.
   *
   * - Idempotent: returns silently if the session no longer exists.
   * - Releases the reserved bytes from the account.
   * - Best-effort Cloudinary cleanup: errors are logged, never re-thrown.
   * - Deletes the Redis session.
   */
  async abortUpload(userId: string, dto: AbortDirectUploadDto): Promise<void> {
    const raw = await this.redis.get(SESSION_KEY(dto.uploadId));

    // Idempotent — session may have already expired or been cleaned up.
    if (!raw) {
      return;
    }

    const session: DirectUploadSession = JSON.parse(raw) as DirectUploadSession;
    this.assertSessionOwner(session, userId);

    // Release reserved bytes.
    await this.dataSource.transaction(async (manager) => {
      await this.adjustAccountUsage(manager, session.accountId, -BigInt(session.fileSizeBytes));
    });

    // Best-effort Cloudinary cleanup — never throw.
    try {
      const account = await this.requireAccount(session.accountId);
      const resourceType = resourceTypeForMime(session.mimeType);
      const apiSecret = this.aesGcm.decrypt(account.apiSecretEncrypted);
      await this.uploader.destroy(
        { cloudName: account.cloudName, apiKey: account.apiKey, apiSecret },
        dto.uploadId,
        resourceType,
      );
    } catch (err) {
      this.logger.warn(
        `Cloudinary abort cleanup failed for uploadId=${dto.uploadId}: ${String(err)}`,
      );
    }

    await this.redis.del(SESSION_KEY(dto.uploadId));

    this.logger.log(
      `Direct-upload aborted: uploadId=${dto.uploadId} userId=${userId} ` +
        `released=${session.fileSizeBytes} bytes`,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Generates signed Cloudinary upload fields for one part.
   *
   * Returns structured fields (uploadUrl, apiKey, timestamp, signature,
   * folder, publicId, resourceType) — NOT a pre-built signed query-param URL.
   * The browser must submit ALL these fields as FormData alongside the file.
   * Embedding signed params in the query string causes Cloudinary to compute
   * the signature only over FormData body fields, producing a mismatch (401).
   *
   * NEVER returns api_secret or api_key in logs.
   */
  private async generateSignedUrl(
    account: CloudinaryAccount,
    uploadId: string,
    mimeType: string,
    userId: string,
    partIndex: number,
  ): Promise<{
    uploadUrl: string;
    cloudName: string;
    resourceType: string;
    apiKey: string;
    timestamp: number;
    signature: string;
    folder: string;
    publicId: string;
  }> {
    const folder = `${DIRECT_UPLOAD_FOLDER_ROOT}/${userId}`;
    const resourceType = resourceTypeForMime(mimeType);
    const publicId = `${uploadId}__part_${partIndex}`;
    const apiSecret = this.aesGcm.decrypt(account.apiSecretEncrypted);
    const timestamp = Math.floor(Date.now() / 1000);

    const signed = this.uploader.signUploadParams(
      { cloudName: account.cloudName, apiKey: account.apiKey, apiSecret },
      { folder, public_id: publicId, timestamp },
      timestamp,
    );

    const uploadUrl =
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(account.cloudName)}` +
      `/${resourceType}/upload`;

    this.logger.debug(
      `Signed upload params: uploadId=${uploadId} partIndex=${partIndex} ` +
        `cloudName=${account.cloudName} resourceType=${resourceType} ` +
        `folder=${folder} publicId=${publicId} timestamp=${signed.timestamp}`,
    );

    return {
      uploadUrl,
      cloudName: account.cloudName,
      resourceType,
      apiKey: account.apiKey,
      timestamp: signed.timestamp,
      signature: signed.signature,
      folder,
      publicId,
    };
  }

  /** Loads accounts for the user with a pessimistic write lock. */
  private async loadLockedAccounts(
    manager: EntityManager,
    userId: string,
  ): Promise<CloudinaryAccount[]> {
    return manager
      .createQueryBuilder(CloudinaryAccount, 'account')
      .setLock('pessimistic_write')
      .where('account.user_id = :userId', { userId })
      .andWhere('account.is_active = true')
      .orderBy('account.role', 'ASC')
      .addOrderBy('account.secondary_order', 'ASC')
      .getMany();
  }

  /** Adjusts an account's storageUsedBytes by delta (positive = increase, negative = decrease). */
  private async adjustAccountUsage(
    manager: EntityManager,
    accountId: string,
    delta: bigint,
  ): Promise<void> {
    const repo = manager.getRepository(CloudinaryAccount);
    const account = await repo.findOne({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException(`Cloudinary account ${accountId} not found.`);
    }
    const next = BigInt(account.storageUsedBytes) + delta;
    account.storageUsedBytes = (next > 0n ? next : 0n).toString();
    await repo.save(account);
  }

  /** Loads a session from Redis; throws 404 if not found. */
  private async requireSession(uploadId: string): Promise<DirectUploadSession> {
    const raw = await this.redis.get(SESSION_KEY(uploadId));
    if (!raw) {
      throw new NotFoundException(
        `Upload session ${uploadId} not found or has expired.`,
      );
    }
    return JSON.parse(raw) as DirectUploadSession;
  }

  /** Loads a Cloudinary account by id; throws 404 if not found. */
  private async requireAccount(accountId: string): Promise<CloudinaryAccount> {
    const account = await this.accountRepo.findOne({
      where: { id: accountId },
      select: [
        'id',
        'cloudName',
        'apiKey',
        'apiSecretEncrypted',
        'storageUsedBytes',
        'storageLimitBytes',
        'userId',
        'role',
        'secondaryOrder',
        'isActive',
      ],
    });
    if (!account) {
      throw new NotFoundException(`Cloudinary account ${accountId} not found.`);
    }
    return account;
  }

  /** Throws 403 if the session does not belong to the requesting user. */
  private assertSessionOwner(session: DirectUploadSession, userId: string): void {
    if (session.userId !== userId) {
      throw new ForbiddenException('You do not own this upload session.');
    }
  }

  /** Throws 415 if the MIME type is not on the allowlist. */
  private assertAllowedMimeType(mimeType: string): void {
    if (!isAllowedMimeType(mimeType)) {
      throw new HttpException(
        `Unsupported media type "${mimeType}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}.`,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }
  }

  /** Builds the 507 Insufficient Storage exception with structured body. */
  private buildInsufficientStorageException(
    reason: PreflightRejectReason,
    largestFreeSlotBytes: string,
    vaultFreeBytes: string,
  ): HttpException {
    const message =
      reason === PreflightRejectReason.VAULT_FULL
        ? `Your Vault doesn't have room for this file. Free: ${vaultFreeBytes} bytes.`
        : `This file is larger than the free space on any single Cloudinary account. Largest free slot: ${largestFreeSlotBytes} bytes.`;

    return new HttpException(
      {
        statusCode: HttpStatus.INSUFFICIENT_STORAGE,
        error: 'Insufficient Storage',
        reason,
        message,
        largestFreeSlotBytes,
        vaultFreeBytes,
      },
      HttpStatus.INSUFFICIENT_STORAGE,
    );
  }
}