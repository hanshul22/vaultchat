import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AesGcmService } from '../common/encryption/aes-gcm.service';
import {
  CloudinaryUploaderService,
  CloudinaryResourceType,
} from '../common/cloudinary/cloudinary-uploader.service';
import { CloudinaryAccount } from '../cloudinary-accounts/entities/cloudinary-account.entity';
import { Media } from './entities/media.entity';
import { MediaPart } from './entities/media-part.entity';
import { MagicByteValidator } from './magic-byte.validator';
import { ALLOWED_MIME_TYPES, isAllowedMimeType, resourceTypeForMime } from './media.constants';
import { MAX_UPLOAD_SIZE_BYTES } from './dto/upload-preflight.dto';
import { MediaListQueryDto } from './dto/media-list-query.dto';
import { MediaListResponseDto, MediaResponseDto } from './dto/media-response.dto';
import { selectAccountForUpload } from './selectors/cloudinary-account-selector';
import { PreflightRejectReason, PreflightResult } from './types/preflight-result.type';
import { SelectableAccount } from './types/media-upload-target.type';

/**
 * Shape of the multipart file part handed over by Multer
 * (@nestjs/platform-express FileInterceptor). Declared locally because
 * @types/multer is not installed — we only need these fields.
 */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Metadata that may accompany an upload (from MediaUploadDto). */
export interface UploadContext {
  storageSpaceId?: string | null;
  /** Client-generated UUID tying all chunks of one logical upload. */
  mediaId?: string;
  /** 0-based chunk index. Defaults to 0 for single-part uploads. */
  partIndex?: number;
  /** Total chunks. Defaults to 1 for single-part uploads. */
  totalParts?: number;
  /**
   * Total byte size of the original file (all chunks combined).
   * Used on partIndex 0 to reserve the full logical file size.
   */
  totalFileSize?: number;
}

/**
 * Builds the human-readable 507 message that pairs with each reject reason,
 * mirroring StorageModel.md §4.
 */
const reasonMessage = (
  reason: PreflightRejectReason,
  largestFreeSlotBytes: string,
  vaultFreeBytes: string,
): string =>
  reason === PreflightRejectReason.VAULT_FULL
    ? `Your Vault doesn't have room for this file. Free: ${vaultFreeBytes} bytes. ` +
      'Consider deleting old files or adding another Cloudinary account.'
    : 'This file is larger than the free space on any single Cloudinary account ' +
      `in your Vault. Largest free slot: ${largestFreeSlotBytes} bytes. ` +
      'Try a smaller file or add another account.';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(Media)
    private readonly mediaRepo: Repository<Media>,
    @InjectRepository(MediaPart)
    private readonly mediaPartRepo: Repository<MediaPart>,
    @InjectRepository(CloudinaryAccount)
    private readonly accountRepo: Repository<CloudinaryAccount>,
    private readonly dataSource: DataSource,
    private readonly aesGcm: AesGcmService,
    private readonly uploader: CloudinaryUploaderService,
    private readonly magicBytes: MagicByteValidator,
  ) {}

  // ── Preflight ──────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/media/upload/preflight.
   *
   * Runs the selection algorithm without touching quota or Cloudinary, so the
   * UI can show a trustworthy answer before a single byte is uploaded
   * (StorageModel.md §4). MIME type is validated here too so the preflight is
   * consistent with what the real upload would accept.
   */
  async preflight(
    userId: string,
    fileSizeBytes: number,
    mimeType: string,
  ): Promise<PreflightResult> {
    if (!isAllowedMimeType(mimeType)) {
      throw new UnsupportedMediaTypeException(
        `Unsupported media type "${mimeType}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}.`,
      );
    }

    const accounts = await this.loadSelectableAccounts(userId);
    const outcome = selectAccountForUpload(accounts, BigInt(fileSizeBytes));

    if (outcome.account) {
      return {
        canUpload: true,
        targetAccountId: outcome.account.id,
        targetAccountRole: outcome.account.role,
        targetSecondaryOrder: outcome.account.secondaryOrder,
        largestFreeSlotBytes: outcome.largestFreeSlotBytes,
        vaultFreeBytes: outcome.vaultFreeBytes,
      };
    }

    return {
      canUpload: false,
      reason: outcome.reason ?? PreflightRejectReason.VAULT_FULL,
      largestFreeSlotBytes: outcome.largestFreeSlotBytes,
      vaultFreeBytes: outcome.vaultFreeBytes,
    };
  }

  // ── Upload ───────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/media/upload.
   *
   * Handles both single-part and multipart (chunked) uploads.
   *
   * Single-part (partIndex 0, totalParts 1):
   *   1. Validate size + MIME + magic bytes.
   *   2. Reserve quota (SELECT FOR UPDATE on chosen account).
   *   3. Upload to Cloudinary.
   *   4. Persist Media row.
   *
   * Multipart (totalParts > 1):
   *   partIndex 0  — reserve totalFileSize bytes, upload chunk, save MediaPart.
   *   intermediate — upload chunk, save MediaPart (no additional reservation).
   *   final chunk  — upload chunk, save MediaPart, commit Media row
   *                  (isMultipart = true), delete all MediaPart rows.
   *   any failure  — destroy all previously uploaded Cloudinary parts for this
   *                  mediaId, release the storage reservation.
   */
  async upload(
    userId: string,
    file: UploadedFile,
    context: UploadContext = {},
  ): Promise<MediaResponseDto> {
    if (!file) {
      throw new HttpException('No file was provided in the "file" field.', HttpStatus.BAD_REQUEST);
    }

    // Normalise multipart context with defaults for single-part uploads.
    const partIndex = context.partIndex ?? 0;
    const totalParts = context.totalParts ?? 1;
    const isMultipart = totalParts > 1;

    // ── Step 1 — size ceiling ────────────────────────────────────────────────
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      throw new PayloadTooLargeException(
        `File exceeds the ${MAX_UPLOAD_SIZE_BYTES}-byte (100 MB) limit.`,
      );
    }

    // ── Step 1 — declared MIME allowlist ────────────────────────────────────
    if (!isAllowedMimeType(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        `Unsupported media type "${file.mimetype}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}.`,
      );
    }

    // ── Step 2 — magic bytes ─────────────────────────────────────────────────
    const detected = await this.magicBytes.detect(file.buffer);
    if (!detected || !isAllowedMimeType(detected.mime)) {
      throw new UnsupportedMediaTypeException(
        'File content does not match a supported media type. ' +
          'The file may be corrupt or disguised.',
      );
    }
    if (!this.familiesMatch(file.mimetype, detected.mime)) {
      throw new UnsupportedMediaTypeException(
        `Declared type "${file.mimetype}" does not match detected content "${detected.mime}".`,
      );
    }

    const chunkSize = BigInt(file.size);
    const resourceType = resourceTypeForMime(detected.mime);

    // ── Step 3 — reserve quota (first chunk only for multipart) ─────────────
    // For multipart uploads, reserve the full logical file size on partIndex 0
    // so the Vault capacity check is accurate for the entire file, not just
    // the first chunk.
    let reserved: CloudinaryAccount;

    if (!isMultipart || partIndex === 0) {
      const reserveSize =
        isMultipart && context.totalFileSize != null ? BigInt(context.totalFileSize) : chunkSize;
      reserved = await this.reserveAccount(userId, reserveSize);
    } else {
      // Subsequent chunks: look up the account that was reserved on partIndex 0.
      const firstPart = await this.mediaPartRepo.findOne({
        where: { mediaId: context.mediaId, partIndex: 0 },
        select: ['cloudinaryAccountId'],
      });
      if (!firstPart) {
        throw new HttpException(
          `No reservation found for mediaId=${context.mediaId}. ` + 'Upload partIndex 0 first.',
          HttpStatus.BAD_REQUEST,
        );
      }
      const account = await this.accountRepo.findOne({
        where: { id: firstPart.cloudinaryAccountId },
      });
      if (!account) {
        throw new HttpException(
          `Cloudinary account for mediaId=${context.mediaId} not found.`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      reserved = account;
    }

    // Decrypt credentials (never logged / returned).
    const apiSecret = this.aesGcm.decrypt(reserved.apiSecretEncrypted);

    // ── Step 4 — upload chunk to Cloudinary ──────────────────────────────────
    let uploadResult;
    try {
      uploadResult = await this.uploader.upload(
        { cloudName: reserved.cloudName, apiKey: reserved.apiKey, apiSecret },
        file.buffer,
        { resourceType, folder: `vaultchat/${userId}` },
      );
    } catch {
      // On failure: release reservation (first chunk) and destroy any
      // previously uploaded parts for this mediaId.
      if (!isMultipart || partIndex === 0) {
        await this.releaseReservation(reserved.id, chunkSize);
      }
      if (isMultipart && context.mediaId) {
        await this.destroyUploadedParts(userId, context.mediaId, resourceType, reserved);
      }
      this.logger.error(
        `Upload to Cloudinary failed; reservation rolled back for ` +
          `accountId=${reserved.id} userId=${userId} partIndex=${partIndex}.`,
      );
      throw new HttpException(
        'Upload to Cloudinary failed. Please try again.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    // ── Step 5 — persist MediaPart row (multipart) or Media row (single) ─────
    if (!isMultipart) {
      // Single-part: create the Media row directly.
      const media = this.mediaRepo.create({
        ownerId: userId,
        cloudinaryAccountId: reserved.id,
        storageSpaceId: context.storageSpaceId ?? null,
        cloudinaryPublicId: uploadResult.publicId,
        url: uploadResult.url,
        mimeType: detected.mime,
        sizeBytes: chunkSize.toString(),
        width: uploadResult.width,
        height: uploadResult.height,
        durationSeconds:
          uploadResult.durationSeconds != null ? uploadResult.durationSeconds.toString() : null,
        isOrphaned: false,
        isMultipart: false,
      });

      const saved = await this.mediaRepo.save(media);

      this.logger.log(
        `Media uploaded: id=${saved.id} userId=${userId} ` +
          `accountId=${reserved.id} bytes=${chunkSize.toString()}`,
      );

      return new MediaResponseDto(saved);
    }

    // Multipart: save the MediaPart row for this chunk.
    const clientMediaId = context.mediaId ?? '';
    const part = this.mediaPartRepo.create({
      mediaId: clientMediaId,
      partIndex,
      totalParts,
      cloudinaryPublicId: uploadResult.publicId,
      cloudName: reserved.cloudName,
      sizeBytes: chunkSize.toString(),
      cloudinaryAccountId: reserved.id,
      mimeType: detected.mime,
    });
    await this.mediaPartRepo.save(part);

    this.logger.log(
      `MediaPart saved: mediaId=${clientMediaId} partIndex=${partIndex}/${totalParts - 1} ` +
        `userId=${userId} bytes=${chunkSize.toString()}`,
    );

    // ── Step 6 — commit Media row on the final chunk ─────────────────────────
    const isFinalChunk = partIndex === totalParts - 1;

    if (!isFinalChunk) {
      // Intermediate chunk: return a minimal response so the client knows
      // the chunk was accepted. The Media row does not exist yet.
      return {
        id: clientMediaId,
        ownerId: userId,
        storageSpaceId: context.storageSpaceId ?? null,
        cloudinaryPublicId: uploadResult.publicId,
        url: uploadResult.url,
        mimeType: detected.mime,
        sizeBytes: chunkSize.toString(),
        width: null,
        height: null,
        durationSeconds: null,
        createdAt: new Date(),
      } as MediaResponseDto;
    }

    // Final chunk: assemble the committed Media row.
    const firstPart = await this.mediaPartRepo.findOne({
      where: { mediaId: clientMediaId, partIndex: 0 },
    });

    const totalSizeBytes = context.totalFileSize ? BigInt(context.totalFileSize) : chunkSize; // fallback: use last chunk size (inaccurate but safe)

    const media = this.mediaRepo.create({
      ownerId: userId,
      cloudinaryAccountId: reserved.id,
      storageSpaceId: context.storageSpaceId ?? null,
      cloudinaryPublicId: firstPart?.cloudinaryPublicId ?? uploadResult.publicId,
      url: uploadResult.url,
      mimeType: detected.mime,
      sizeBytes: totalSizeBytes.toString(),
      width: uploadResult.width,
      height: uploadResult.height,
      durationSeconds:
        uploadResult.durationSeconds != null ? uploadResult.durationSeconds.toString() : null,
      isOrphaned: false,
      isMultipart: true,
    });

    const saved = await this.mediaRepo.save(media);

    // Clean up the MediaPart staging rows — they are no longer needed.
    await this.mediaPartRepo.delete({ mediaId: clientMediaId });

    this.logger.log(
      `Multipart media committed: id=${saved.id} userId=${userId} ` +
        `accountId=${reserved.id} totalBytes=${totalSizeBytes.toString()} ` +
        `parts=${totalParts}`,
    );

    return new MediaResponseDto(saved);
  }

  // ── Listing ──────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/media — owner's media only, newest first, paginated
   * (PRD §6.2). Orphaned tombstones are excluded from the gallery.
   */
  async list(userId: string, query: MediaListQueryDto): Promise<MediaListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 40;

    const qb = this.mediaRepo
      .createQueryBuilder('media')
      .where('media.owner_id = :userId', { userId })
      .andWhere('media.is_orphaned = false');

    if (query.type) {
      qb.andWhere('media.mime_type LIKE :prefix', { prefix: `${query.type}/%` });
    }

    qb.orderBy('media.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return new MediaListResponseDto(items, page, limit, total);
  }

  // ── Deletion ─────────────────────────────────────────────────────────────

  /**
   * DELETE /api/v1/media/:id (PRD §6.3).
   *
   * Owner-only. Deletes from Cloudinary first, then removes the DB row and
   * decrements the owning account's `storage_used_bytes` in one transaction.
   */
  async remove(userId: string, mediaId: string): Promise<{ deleted: true }> {
    const media = await this.mediaRepo.findOne({
      where: { id: mediaId },
      select: [
        'id',
        'ownerId',
        'cloudinaryAccountId',
        'cloudinaryPublicId',
        'mimeType',
        'sizeBytes',
        'isOrphaned',
      ],
    });

    if (!media) {
      throw new NotFoundException(`Media ${mediaId} not found.`);
    }

    if (media.ownerId !== userId) {
      throw new ForbiddenException('You do not own this media item.');
    }

    const resourceType: CloudinaryResourceType = resourceTypeForMime(media.mimeType);

    if (!media.isOrphaned) {
      const account = await this.accountRepo.findOne({
        where: { id: media.cloudinaryAccountId },
        select: ['id', 'cloudName', 'apiKey', 'apiSecretEncrypted'],
      });

      if (account) {
        const apiSecret = this.aesGcm.decrypt(account.apiSecretEncrypted);
        try {
          await this.uploader.destroy(
            { cloudName: account.cloudName, apiKey: account.apiKey, apiSecret },
            media.cloudinaryPublicId,
            resourceType,
          );
        } catch {
          // TODO(phase-later): enqueue a BullMQ `media-destroy-retry` job here.
          this.logger.error(
            `Cloudinary destroy failed for media=${mediaId}; DB row left intact for retry.`,
          );
          throw new HttpException(
            'Failed to delete the file from Cloudinary. Please try again.',
            HttpStatus.BAD_GATEWAY,
          );
        }
      }
    }

    await this.dataSource.transaction(async (manager) => {
      if (!media.isOrphaned) {
        await manager
          .createQueryBuilder()
          .update(CloudinaryAccount)
          .set({
            storageUsedBytes: () =>
              `GREATEST(storage_used_bytes - ${BigInt(media.sizeBytes).toString()}, 0)`,
          })
          .where('id = :id', { id: media.cloudinaryAccountId })
          .execute();
      }

      await manager.delete(Media, { id: mediaId });
    });

    this.logger.log(
      `Media deleted: id=${mediaId} userId=${userId} ` +
        `freed=${media.sizeBytes} bytes from accountId=${media.cloudinaryAccountId}`,
    );

    return { deleted: true };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async loadSelectableAccounts(userId: string): Promise<SelectableAccount[]> {
    const rows = await this.accountRepo.find({
      where: { userId, isActive: true },
      select: ['id', 'role', 'secondaryOrder', 'storageUsedBytes', 'storageLimitBytes'],
    });

    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      secondaryOrder: r.secondaryOrder,
      storageUsedBytes: r.storageUsedBytes,
      storageLimitBytes: r.storageLimitBytes,
    }));
  }

  private async reserveAccount(userId: string, fileSize: bigint): Promise<CloudinaryAccount> {
    return this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .createQueryBuilder(CloudinaryAccount, 'account')
        .setLock('pessimistic_write')
        .where('account.user_id = :userId', { userId })
        .andWhere('account.is_active = true')
        .orderBy('account.role', 'ASC')
        .addOrderBy('account.secondary_order', 'ASC')
        .getMany();

      const selectable: SelectableAccount[] = locked.map((r) => ({
        id: r.id,
        role: r.role,
        secondaryOrder: r.secondaryOrder,
        storageUsedBytes: r.storageUsedBytes,
        storageLimitBytes: r.storageLimitBytes,
      }));

      const outcome = selectAccountForUpload(selectable, fileSize);

      if (!outcome.account) {
        const reason = outcome.reason ?? PreflightRejectReason.VAULT_FULL;
        throw new HttpException(
          {
            statusCode: HttpStatus.INSUFFICIENT_STORAGE,
            error: 'Insufficient Storage',
            reason,
            message: reasonMessage(reason, outcome.largestFreeSlotBytes, outcome.vaultFreeBytes),
            largestFreeSlotBytes: outcome.largestFreeSlotBytes,
            vaultFreeBytes: outcome.vaultFreeBytes,
          },
          HttpStatus.INSUFFICIENT_STORAGE,
        );
      }

      const chosen = locked.find((a) => a.id === outcome.account!.id)!;

      await manager
        .createQueryBuilder()
        .update(CloudinaryAccount)
        .set({ storageUsedBytes: () => `storage_used_bytes + ${fileSize.toString()}` })
        .where('id = :id', { id: chosen.id })
        .execute();

      return chosen;
    });
  }

  private async releaseReservation(accountId: string, fileSize: bigint): Promise<void> {
    await this.accountRepo
      .createQueryBuilder()
      .update(CloudinaryAccount)
      .set({
        storageUsedBytes: () => `GREATEST(storage_used_bytes - ${fileSize.toString()}, 0)`,
      })
      .where('id = :id', { id: accountId })
      .execute();
  }

  /**
   * Destroys all Cloudinary assets previously uploaded for a given mediaId
   * (used during multipart upload rollback). Best-effort — errors are logged
   * but do not throw so the caller can still surface the original failure.
   */
  private async destroyUploadedParts(
    userId: string,
    mediaId: string,
    resourceType: CloudinaryResourceType,
    account: CloudinaryAccount,
  ): Promise<void> {
    const parts = await this.mediaPartRepo.find({
      where: { mediaId },
      select: ['cloudinaryPublicId'],
    });

    if (parts.length === 0) return;

    const apiSecret = this.aesGcm.decrypt(account.apiSecretEncrypted);

    for (const part of parts) {
      try {
        await this.uploader.destroy(
          { cloudName: account.cloudName, apiKey: account.apiKey, apiSecret },
          part.cloudinaryPublicId,
          resourceType,
        );
      } catch {
        this.logger.warn(
          `Failed to destroy Cloudinary part ${part.cloudinaryPublicId} ` +
            `for mediaId=${mediaId} userId=${userId} — manual cleanup may be needed.`,
        );
      }
    }

    // Remove the staging rows regardless of destroy success.
    await this.mediaPartRepo.delete({ mediaId });
  }

  private familiesMatch(declared: string, detected: string): boolean {
    const family = (m: string): string => m.split('/')[0] ?? m;
    return family(declared) === family(detected);
  }
}
