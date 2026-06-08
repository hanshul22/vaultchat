import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { AesGcmService } from '../common/encryption/aes-gcm.service';
import {
  CloudinaryResourceType,
  CloudinaryUploaderService,
} from '../common/cloudinary/cloudinary-uploader.service';
import { CloudinaryAccount } from '../cloudinary-accounts/entities/cloudinary-account.entity';
import { DirectUploadAbortDto } from './dto/direct-upload-abort.dto';
import { DirectUploadCompleteDto } from './dto/direct-upload-complete.dto';
import { DirectUploadInitDto } from './dto/direct-upload-init.dto';
import { DirectUploadSignPartDto } from './dto/direct-upload-sign-part.dto';
import { MediaListQueryDto } from './dto/media-list-query.dto';
import { MediaListResponseDto, MediaResponseDto } from './dto/media-response.dto';
import { Media, MediaUploadStatus } from './entities/media.entity';
import { MediaPart } from './entities/media-part.entity';
import {
  ALLOWED_MIME_TYPES,
  DIRECT_UPLOAD_FOLDER_ROOT,
  DIRECT_UPLOAD_MAX_CHUNK_SIZE_BYTES,
  isAllowedMimeType,
  resourceTypeForMime,
} from './media.constants';
import { selectAccountForUpload } from './selectors/cloudinary-account-selector';
import { DirectUploadCompleteResponse } from './types/direct-upload-complete-response.type';
import { DirectUploadInitResponse } from './types/direct-upload-init-response.type';
import { DirectUploadSignPartResponse } from './types/direct-upload-sign-part-response.type';
import { SelectableAccount } from './types/media-upload-target.type';
import { PreflightRejectReason, PreflightResult } from './types/preflight-result.type';

interface SelectableAccountRow extends SelectableAccount {
  cloudName: string;
}

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
  ) {}

  async preflight(userId: string, fileSizeBytes: number, mimeType: string): Promise<PreflightResult> {
    this.assertAllowedMimeType(mimeType);

    const accounts = await this.loadSelectableAccounts(userId);
    const outcome = selectAccountForUpload(accounts, BigInt(fileSizeBytes));

    if (outcome.account) {
      const selected = accounts.find((account) => account.id === outcome.account!.id)!;
      return {
        canUpload: true,
        cloudName: selected.cloudName,
        uploadFolder: this.buildUploadFolder(userId),
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

  async directUploadInit(
    userId: string,
    dto: DirectUploadInitDto,
  ): Promise<DirectUploadInitResponse> {
    this.assertAllowedMimeType(dto.mimeType);

    const existing = await this.mediaRepo.findOne({
      where: { id: dto.mediaId },
      select: ['id', 'ownerId'],
    });

    if (existing) {
      if (existing.ownerId !== userId) {
        throw new ForbiddenException('You do not own this media upload operation.');
      }
      throw new ConflictException(`Media ${dto.mediaId} already exists.`);
    }

    const preflight = await this.preflight(userId, dto.totalFileSize, dto.mimeType);
    if (!preflight.canUpload || !preflight.targetAccountId) {
      throw this.buildInsufficientStorageException(
        preflight.reason ?? PreflightRejectReason.VAULT_FULL,
        preflight.largestFreeSlotBytes ?? '0',
        preflight.vaultFreeBytes ?? '0',
      );
    }

    const reservation = await this.createDirectUploadReservation(userId, dto, preflight.targetAccountId);
    const partZeroPublicId = this.buildPartPublicId(dto.mediaId, 0);
    const apiSecret = this.aesGcm.decrypt(reservation.account.apiSecretEncrypted);
    const timestamp = Math.floor(Date.now() / 1000);
    const signed = this.uploader.signUploadParams(
      {
        cloudName: reservation.account.cloudName,
        apiKey: reservation.account.apiKey,
        apiSecret,
      },
      {
        folder: reservation.folder,
        public_id: partZeroPublicId,
        timestamp,
      },
      timestamp,
    );

    return {
      uploadId: dto.mediaId,
      cloudName: reservation.account.cloudName,
      apiKey: reservation.account.apiKey,
      signature: signed.signature,
      timestamp: signed.timestamp,
      folder: reservation.folder,
      publicIdPattern: this.buildPublicIdPattern(dto.mediaId),
      maxChunkSizeBytes: DIRECT_UPLOAD_MAX_CHUNK_SIZE_BYTES,
    };
  }

  async directUploadSignPart(
    userId: string,
    dto: DirectUploadSignPartDto,
  ): Promise<DirectUploadSignPartResponse> {
    const media = await this.requireOwnedMedia(userId, dto.mediaId, [
      'id',
      'ownerId',
      'cloudinaryAccountId',
      'uploadStatus',
      'totalParts',
    ]);

    if (media.uploadStatus !== MediaUploadStatus.UPLOADING) {
      throw new ConflictException('Chunk signing is only available while uploadStatus is uploading.');
    }
    if (dto.totalParts !== media.totalParts) {
      throw new BadRequestException('totalParts does not match the reserved upload contract.');
    }
    if (dto.partIndex < 0 || dto.partIndex >= media.totalParts) {
      throw new BadRequestException('partIndex is outside the reserved upload range.');
    }

    const account = await this.requireAccount(media.cloudinaryAccountId);
    const folder = this.buildUploadFolder(userId);
    const publicId = this.buildPartPublicId(media.id, dto.partIndex);
    const apiSecret = this.aesGcm.decrypt(account.apiSecretEncrypted);
    const timestamp = Math.floor(Date.now() / 1000);
    const signed = this.uploader.signUploadParams(
      {
        cloudName: account.cloudName,
        apiKey: account.apiKey,
        apiSecret,
      },
      {
        folder,
        public_id: publicId,
        timestamp,
      },
      timestamp,
    );

    return {
      signature: signed.signature,
      timestamp: signed.timestamp,
      publicId,
      apiKey: account.apiKey,
      cloudName: account.cloudName,
    };
  }

  async directUploadComplete(
    userId: string,
    dto: DirectUploadCompleteDto,
  ): Promise<DirectUploadCompleteResponse> {
    const media = await this.requireOwnedMedia(userId, dto.mediaId, [
      'id',
      'ownerId',
      'cloudinaryAccountId',
      'mimeType',
      'sizeBytes',
      'totalParts',
      'uploadStatus',
      'storageSpaceId',
      'isMultipart',
      'isOrphaned',
      'createdAt',
      'cloudinaryPublicId',
      'url',
      'width',
      'height',
      'durationSeconds',
    ]);

    if (media.uploadStatus !== MediaUploadStatus.UPLOADING) {
      throw new ConflictException('Only uploading media can be finalized.');
    }

    this.assertCompleteParts(dto, media.totalParts);

    const reservedBytes = BigInt(media.sizeBytes);
    const compressedTotalBytes = BigInt(dto.compressedTotalBytes);
    if (compressedTotalBytes > reservedBytes) {
      throw new BadRequestException('compressedTotalBytes cannot exceed the originally reserved totalFileSize.');
    }

    const summedPartBytes = dto.parts.reduce((sum, part) => sum + BigInt(part.sizeBytes), 0n);
    if (summedPartBytes !== compressedTotalBytes) {
      throw new BadRequestException('compressedTotalBytes must equal the sum of all uploaded part sizes.');
    }

    const account = await this.requireAccount(media.cloudinaryAccountId);
    const finalized = await this.dataSource.transaction(async (manager) => {
      const mediaPartRepo = manager.getRepository(MediaPart);
      const mediaRepo = manager.getRepository(Media);

      await mediaPartRepo.delete({ mediaId: media.id });
      await mediaPartRepo.save(
        dto.parts.map((part) =>
          mediaPartRepo.create({
            mediaId: media.id,
            partIndex: part.partIndex,
            totalParts: media.totalParts,
            cloudinaryPublicId: part.publicId,
            cloudName: account.cloudName,
            sizeBytes: String(part.sizeBytes),
            cloudinaryAccountId: media.cloudinaryAccountId,
            mimeType: media.mimeType,
          }),
        ),
      );

      const delta = reservedBytes - compressedTotalBytes;
      if (delta > 0n) {
        await this.adjustAccountUsage(manager, media.cloudinaryAccountId, -delta);
      }

      const firstPart = dto.parts.find((part) => part.partIndex === 0)!;
      media.cloudinaryPublicId = firstPart.publicId;
      media.url = this.uploader.buildDeliveryUrl(
        account.cloudName,
        resourceTypeForMime(media.mimeType),
        firstPart.publicId,
      );
      media.sizeBytes = compressedTotalBytes.toString();
      media.uploadStatus = MediaUploadStatus.READY;
      media.isMultipart = media.totalParts > 1;

      return mediaRepo.save(media);
    });

    this.logger.log(
      `Direct upload completed: mediaId=${media.id} userId=${userId} ` +
        `accountId=${media.cloudinaryAccountId} compressedBytes=${compressedTotalBytes.toString()}`,
    );

    return new MediaResponseDto(finalized);
  }

  async directUploadAbort(userId: string, dto: DirectUploadAbortDto): Promise<{ success: true }> {
    const media = await this.requireOwnedMedia(userId, dto.mediaId, [
      'id',
      'ownerId',
      'cloudinaryAccountId',
      'mimeType',
      'sizeBytes',
      'uploadStatus',
    ]);

    if (media.uploadStatus !== MediaUploadStatus.UPLOADING) {
      throw new ConflictException('Only uploading media can be aborted.');
    }

    const account = await this.requireAccount(media.cloudinaryAccountId);
    const resourceType = resourceTypeForMime(media.mimeType);
    await this.destroyDirectUploadParts(account, resourceType, dto.uploadedParts.map((part) => part.publicId));

    await this.dataSource.transaction(async (manager) => {
      await this.adjustAccountUsage(manager, media.cloudinaryAccountId, -BigInt(media.sizeBytes));
      await manager.getRepository(MediaPart).delete({ mediaId: media.id });
      media.uploadStatus = MediaUploadStatus.FAILED;
      await manager.getRepository(Media).save(media);
    });

    this.logger.log(
      `Direct upload aborted: mediaId=${media.id} userId=${userId} ` +
        `released=${media.sizeBytes} accountId=${media.cloudinaryAccountId}`,
    );

    return { success: true };
  }

  async list(userId: string, query: MediaListQueryDto): Promise<MediaListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 40;

    const qb = this.mediaRepo
      .createQueryBuilder('media')
      .where('media.owner_id = :userId', { userId })
      .andWhere('media.is_orphaned = false')
      .andWhere('media.upload_status = :uploadStatus', { uploadStatus: MediaUploadStatus.READY });

    if (query.type) {
      qb.andWhere('media.mime_type LIKE :prefix', { prefix: `${query.type}/%` });
    }

    qb.orderBy('media.created_at', 'DESC').skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return new MediaListResponseDto(items, page, limit, total);
  }

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
        'uploadStatus',
      ],
    });

    if (!media) {
      throw new NotFoundException(`Media ${mediaId} not found.`);
    }
    if (media.ownerId !== userId) {
      throw new ForbiddenException('You do not own this media item.');
    }

    const publicIds = await this.loadMediaPublicIds(mediaId, media.cloudinaryPublicId);
    const resourceType: CloudinaryResourceType = resourceTypeForMime(media.mimeType);

    if (!media.isOrphaned) {
      const account = await this.accountRepo.findOne({
        where: { id: media.cloudinaryAccountId },
        select: ['id', 'cloudName', 'apiKey', 'apiSecretEncrypted'],
      });

      if (account) {
        const apiSecret = this.aesGcm.decrypt(account.apiSecretEncrypted);
        try {
          for (const publicId of publicIds) {
            await this.uploader.destroy(
              { cloudName: account.cloudName, apiKey: account.apiKey, apiSecret },
              publicId,
              resourceType,
            );
          }
        } catch {
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
      if (!media.isOrphaned && media.uploadStatus !== MediaUploadStatus.FAILED) {
        await this.adjustAccountUsage(manager, media.cloudinaryAccountId, -BigInt(media.sizeBytes));
      }
      await manager.getRepository(MediaPart).delete({ mediaId });
      await manager.getRepository(Media).delete({ id: mediaId });
    });

    this.logger.log(
      `Media deleted: id=${mediaId} userId=${userId} ` +
        `freed=${media.uploadStatus === MediaUploadStatus.FAILED ? '0' : media.sizeBytes} ` +
        `bytes from accountId=${media.cloudinaryAccountId}`,
    );

    return { deleted: true };
  }

  private assertAllowedMimeType(mimeType: string): void {
    if (!isAllowedMimeType(mimeType)) {
      throw new UnsupportedMediaTypeException(
        `Unsupported media type "${mimeType}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}.`,
      );
    }
  }

  private async loadSelectableAccounts(userId: string): Promise<SelectableAccountRow[]> {
    const rows = await this.accountRepo.find({
      where: { userId, isActive: true },
      select: ['id', 'role', 'secondaryOrder', 'storageUsedBytes', 'storageLimitBytes', 'cloudName'],
    });

    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      secondaryOrder: row.secondaryOrder,
      storageUsedBytes: row.storageUsedBytes,
      storageLimitBytes: row.storageLimitBytes,
      cloudName: row.cloudName,
    }));
  }

  private buildInsufficientStorageException(
    reason: PreflightRejectReason,
    largestFreeSlotBytes: string,
    vaultFreeBytes: string,
  ): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.INSUFFICIENT_STORAGE,
        error: 'Insufficient Storage',
        reason,
        message: reasonMessage(reason, largestFreeSlotBytes, vaultFreeBytes),
        largestFreeSlotBytes,
        vaultFreeBytes,
      },
      HttpStatus.INSUFFICIENT_STORAGE,
    );
  }

  private async createDirectUploadReservation(
    userId: string,
    dto: DirectUploadInitDto,
    expectedAccountId: string,
  ): Promise<{ account: CloudinaryAccount; folder: string }> {
    return this.dataSource.transaction(async (manager) => {
      const accounts = await this.loadLockedAccounts(manager, userId);
      const selectable: SelectableAccount[] = accounts.map((account) => ({
        id: account.id,
        role: account.role,
        secondaryOrder: account.secondaryOrder,
        storageUsedBytes: account.storageUsedBytes,
        storageLimitBytes: account.storageLimitBytes,
      }));

      const outcome = selectAccountForUpload(selectable, BigInt(dto.totalFileSize));
      if (!outcome.account) {
        throw this.buildInsufficientStorageException(
          outcome.reason ?? PreflightRejectReason.VAULT_FULL,
          outcome.largestFreeSlotBytes,
          outcome.vaultFreeBytes,
        );
      }
      if (outcome.account.id !== expectedAccountId) {
        throw new ConflictException('Upload target changed since preflight. Run preflight again.');
      }

      const chosen = accounts.find((account) => account.id === expectedAccountId);
      if (!chosen) {
        throw new NotFoundException(`Cloudinary account ${expectedAccountId} not found.`);
      }

      const folder = this.buildUploadFolder(userId);
      await this.adjustAccountUsage(manager, chosen.id, BigInt(dto.totalFileSize));

      const mediaRepo = manager.getRepository(Media);
      const publicId = this.buildFullPublicId(folder, this.buildPartPublicId(dto.mediaId, 0));
      await mediaRepo.save(
        mediaRepo.create({
          id: dto.mediaId,
          ownerId: userId,
          cloudinaryAccountId: chosen.id,
          storageSpaceId: null,
          cloudinaryPublicId: publicId,
          url: this.uploader.buildDeliveryUrl(chosen.cloudName, resourceTypeForMime(dto.mimeType), publicId),
          mimeType: dto.mimeType,
          sizeBytes: String(dto.totalFileSize),
          width: null,
          height: null,
          durationSeconds: null,
          isOrphaned: false,
          isMultipart: dto.totalParts > 1,
          totalParts: dto.totalParts,
          uploadStatus: MediaUploadStatus.UPLOADING,
        }),
      );

      return { account: chosen, folder };
    });
  }

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

  private async requireOwnedMedia(userId: string, mediaId: string, select: (keyof Media)[]): Promise<Media> {
    const media = await this.mediaRepo.findOne({ where: { id: mediaId }, select });
    if (!media) {
      throw new NotFoundException(`Media ${mediaId} not found.`);
    }
    if (media.ownerId !== userId) {
      throw new ForbiddenException('You do not own this media item.');
    }
    return media;
  }

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

  private async loadMediaPublicIds(mediaId: string, fallbackPublicId: string): Promise<string[]> {
    const parts = await this.mediaPartRepo.find({
      where: { mediaId },
      select: ['cloudinaryPublicId'],
      order: { partIndex: 'ASC' },
    });
    const ids = parts.map((part) => part.cloudinaryPublicId);
    if (ids.length === 0) {
      ids.push(fallbackPublicId);
    }
    return [...new Set(ids)];
  }

  private async destroyDirectUploadParts(
    account: CloudinaryAccount,
    resourceType: CloudinaryResourceType,
    publicIds: string[],
  ): Promise<void> {
    if (publicIds.length === 0) {
      return;
    }

    const apiSecret = this.aesGcm.decrypt(account.apiSecretEncrypted);
    for (const publicId of [...new Set(publicIds)]) {
      try {
        await this.uploader.destroy(
          { cloudName: account.cloudName, apiKey: account.apiKey, apiSecret },
          publicId,
          resourceType,
        );
      } catch {
        this.logger.warn(`Failed to destroy Cloudinary part ${publicId} during direct-upload abort.`);
      }
    }
  }

  private assertCompleteParts(dto: DirectUploadCompleteDto, expectedTotalParts: number): void {
    if (dto.parts.length !== expectedTotalParts) {
      throw new BadRequestException('parts must contain every index from 0 through totalParts - 1.');
    }

    const indices = dto.parts.map((part) => part.partIndex).sort((a, b) => a - b);
    for (let index = 0; index < expectedTotalParts; index += 1) {
      if (indices[index] !== index) {
        throw new BadRequestException('parts must contain every index from 0 through totalParts - 1.');
      }
    }
  }

  private buildUploadFolder(userId: string): string {
    return `${DIRECT_UPLOAD_FOLDER_ROOT}/${userId}`;
  }

  private buildPartPublicId(mediaId: string, partIndex: number): string {
    return `${mediaId}__part_${partIndex}`;
  }

  private buildPublicIdPattern(mediaId: string): string {
    return `${mediaId}__part_{partIndex}`;
  }

  private buildFullPublicId(folder: string, publicId: string): string {
    return `${folder}/${publicId}`;
  }
}