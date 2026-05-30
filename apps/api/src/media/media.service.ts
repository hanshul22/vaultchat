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

/** Optional metadata that may accompany an upload. */
export interface UploadContext {
  storageSpaceId?: string | null;
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
   * Full pipeline (PRD §6.1, StorageModel.md §4 & §9):
   *   1. Validate size (413) and MIME allowlist (415).
   *   2. Confirm magic bytes match the declared family (415).
   *   3. Select the target account (507 on VAULT_FULL / too-large).
   *   4. Reserve quota under a `SELECT … FOR UPDATE` row lock, re-checking
   *      fit inside the transaction and re-selecting if the locked account
   *      no longer fits (handles concurrent uploads).
   *   5. Upload to Cloudinary; on failure, compensate the reservation.
   *   6. Persist the media row.
   */
  async upload(
    userId: string,
    file: UploadedFile,
    context: UploadContext = {},
  ): Promise<MediaResponseDto> {
    if (!file) {
      throw new HttpException('No file was provided in the "file" field.', HttpStatus.BAD_REQUEST);
    }

    // ── Step 1 — size ceiling (defence in depth alongside Multer limits) ────
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

    // ── Step 2 — magic bytes must agree with the declared type ──────────────
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

    const fileSize = BigInt(file.size);
    const resourceType = resourceTypeForMime(detected.mime);

    // ── Steps 3 + 4 — reserve quota transactionally with a row lock ─────────
    const reserved = await this.reserveAccount(userId, fileSize);

    // Decrypt credentials for the chosen account (never logged / returned).
    const apiSecret = this.aesGcm.decrypt(reserved.apiSecretEncrypted);

    // ── Step 5 — upload to Cloudinary; compensate on failure ────────────────
    let uploadResult;
    try {
      uploadResult = await this.uploader.upload(
        {
          cloudName: reserved.cloudName,
          apiKey: reserved.apiKey,
          apiSecret,
        },
        file.buffer,
        {
          resourceType,
          folder: `vaultchat/${userId}`,
        },
      );
    } catch (err) {
      await this.releaseReservation(reserved.id, fileSize);
      this.logger.error(
        `Upload to Cloudinary failed; reservation rolled back for ` +
          `accountId=${reserved.id} userId=${userId}.`,
      );
      throw new HttpException(
        'Upload to Cloudinary failed. Please try again.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    // ── Step 6 — persist metadata ───────────────────────────────────────────
    const media = this.mediaRepo.create({
      ownerId: userId,
      cloudinaryAccountId: reserved.id,
      storageSpaceId: context.storageSpaceId ?? null,
      cloudinaryPublicId: uploadResult.publicId,
      url: uploadResult.url,
      mimeType: detected.mime,
      sizeBytes: fileSize.toString(),
      width: uploadResult.width,
      height: uploadResult.height,
      durationSeconds:
        uploadResult.durationSeconds != null ? uploadResult.durationSeconds.toString() : null,
      isOrphaned: false,
    });

    const saved = await this.mediaRepo.save(media);

    this.logger.log(
      `Media uploaded: id=${saved.id} userId=${userId} ` +
        `accountId=${reserved.id} bytes=${fileSize.toString()}`,
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
      // 'image' → image/%, 'video' → video/%
      qb.andWhere('media.mime_type LIKE :prefix', {
        prefix: `${query.type}/%`,
      });
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
   *
   * If the Cloudinary destroy call fails, we surface the error and leave the
   * row intact. This is the seam where a BullMQ retry job will be enqueued in
   * a later phase — see the TODO below. The queue is intentionally NOT wired
   * up in Phase 7.
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

    // Only the owner may delete (PRD §6.3). Shared-space editor permissions
    // are layered on by the storage-spaces module in a later phase.
    if (media.ownerId !== userId) {
      throw new ForbiddenException('You do not own this media item.');
    }

    const resourceType: CloudinaryResourceType = resourceTypeForMime(media.mimeType);

    // Orphaned media has no reachable Cloudinary account — skip the remote
    // destroy and just clean up the tombstone row.
    if (!media.isOrphaned) {
      const account = await this.accountRepo.findOne({
        where: { id: media.cloudinaryAccountId },
        select: ['id', 'cloudName', 'apiKey', 'apiSecretEncrypted'],
      });

      if (account) {
        const apiSecret = this.aesGcm.decrypt(account.apiSecretEncrypted);
        try {
          await this.uploader.destroy(
            {
              cloudName: account.cloudName,
              apiKey: account.apiKey,
              apiSecret,
            },
            media.cloudinaryPublicId,
            resourceType,
          );
        } catch (err) {
          // TODO(phase-later): enqueue a BullMQ `media-destroy-retry` job here
          // with { mediaId, accountId, publicId, resourceType } and return 202.
          // For Phase 7 we fail loudly so the row is not lost silently.
          this.logger.error(
            `Cloudinary destroy failed for media=${mediaId}; ` + 'DB row left intact for retry.',
          );
          throw new HttpException(
            'Failed to delete the file from Cloudinary. Please try again.',
            HttpStatus.BAD_GATEWAY,
          );
        }
      }
    }

    // Cloudinary delete succeeded (or was skipped) — now free the quota and
    // drop the row atomically.
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

  /**
   * Loads the user's active accounts as the narrow projection the pure
   * selector consumes.
   */
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

  /**
   * Reserves quota for `fileSize` on the correct account using a row-level
   * lock (StorageModel.md §9). Returns the chosen account's credentials so the
   * caller can perform the upload.
   *
   * Concurrency handling: inside the transaction we lock candidate account
   * rows `FOR UPDATE`, re-run the selector against the freshly-locked figures,
   * and only increment once we confirm the file still fits. If a racing upload
   * filled the first candidate, the re-selection moves us to the next account
   * in fill order. If nothing fits anymore, we throw the appropriate 507.
   */
  private async reserveAccount(userId: string, fileSize: bigint): Promise<CloudinaryAccount> {
    return this.dataSource.transaction(async (manager) => {
      // Lock all active account rows for this user in a deterministic order so
      // concurrent transactions queue rather than deadlock.
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

      // Reserve: increment used bytes on the locked row.
      await manager
        .createQueryBuilder()
        .update(CloudinaryAccount)
        .set({
          storageUsedBytes: () => `storage_used_bytes + ${fileSize.toString()}`,
        })
        .where('id = :id', { id: chosen.id })
        .execute();

      return chosen;
    });
  }

  /** Compensating decrement when a Cloudinary upload fails after reserving. */
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
   * Confirms the declared MIME type and the magic-byte-detected MIME type
   * belong to the same family. file-type reports `video/quicktime` as
   * `video/mp4` for some MOV variants, so we compare on the top-level family
   * (image vs video) which is what determines the Cloudinary resource bucket.
   */
  private familiesMatch(declared: string, detected: string): boolean {
    const family = (m: string): string => m.split('/')[0] ?? m;
    return family(declared) === family(detected);
  }
}
