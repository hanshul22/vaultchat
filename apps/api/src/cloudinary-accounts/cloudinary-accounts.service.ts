import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AesGcmService } from '../common/encryption/aes-gcm.service';
import { CloudinaryVerifierService } from '../common/cloudinary/cloudinary-verifier.service';
import {
  CloudinaryAccount,
  CloudinaryAccountRole,
} from './entities/cloudinary-account.entity';
import { Media } from '../media/entities/media.entity';
import { CreateCloudinaryAccountDto } from './dto/create-cloudinary-account.dto';
import { CloudinaryAccountResponseDto } from './dto/cloudinary-account-response.dto';

/** 25 GiB in bytes */
const DEFAULT_STORAGE_LIMIT_BYTES = BigInt(25) * BigInt(1024 ** 3);

export interface CloudinaryAccountReconciliationRow {
  id: string;
  cloudName: string;
  apiKey: string;
  apiSecretEncrypted: string;
  storageUsedBytes: string;
  isActive: boolean;
}

export interface CloudinaryAccountReconciliationResult {
  accountId: string;
  previousStorageUsedBytes: string;
  actualStorageUsedBytes: string;
  corrected: boolean;
  lastReconciledAt: Date;
}

@Injectable()
export class CloudinaryAccountsService {
  private readonly logger = new Logger(CloudinaryAccountsService.name);

  constructor(
    @InjectRepository(CloudinaryAccount)
    private readonly repo: Repository<CloudinaryAccount>,
    @InjectRepository(Media)
    private readonly mediaRepo: Repository<Media>,
    private readonly dataSource: DataSource,
    private readonly aesGcm: AesGcmService,
    private readonly verifier: CloudinaryVerifierService,
  ) {}

  async findAllForUser(userId: string): Promise<CloudinaryAccountResponseDto[]> {
    const accounts = await this.repo.find({
      where: { userId, isActive: true },
      select: [
        'id', 'userId', 'cloudName', 'apiKey', 'role', 'secondaryOrder',
        'storageUsedBytes', 'storageLimitBytes', 'isActive',
        'lastReconciledAt', 'createdAt', 'updatedAt',
      ],
    });

    accounts.sort((a, b) => {
      const weight = (acc: CloudinaryAccount): number =>
        acc.role === CloudinaryAccountRole.PRIMARY ? 0 : 1;
      const wDiff = weight(a) - weight(b);
      if (wDiff !== 0) return wDiff;
      return (a.secondaryOrder ?? 0) - (b.secondaryOrder ?? 0);
    });

    return accounts.map((a) => new CloudinaryAccountResponseDto(a));
  }

  async verifyAccount(
    userId: string,
    accountId: string,
  ): Promise<{ verified: boolean; message: string }> {
    const account = await this.repo.findOne({
      where: { id: accountId, userId, isActive: true },
      select: ['id', 'cloudName', 'apiKey', 'apiSecretEncrypted'],
    });

    if (!account) {
      throw new NotFoundException(`Cloudinary account ${accountId} not found.`);
    }

    const apiSecret = this.aesGcm.decrypt(account.apiSecretEncrypted);

    await this.verifier.verifyCredentials({
      cloudName: account.cloudName,
      apiKey: account.apiKey,
      apiSecret,
    });

    this.logger.log(
      `Credential verification passed: accountId=${accountId} userId=${userId}`,
    );

    return { verified: true, message: 'Cloudinary credentials are valid.' };
  }

  async swapSecondaryOrder(
    userId: string,
    anchorId: string,
  ): Promise<CloudinaryAccountResponseDto[]> {
    await this.dataSource.transaction(async (manager) => {
      const anchor = await manager.findOne(CloudinaryAccount, {
        where: { id: anchorId, userId, isActive: true },
        select: ['id'],
      });

      if (!anchor) {
        throw new NotFoundException(`Cloudinary account ${anchorId} not found.`);
      }

      const secondaries = await manager.find(CloudinaryAccount, {
        where: { userId, role: CloudinaryAccountRole.SECONDARY, isActive: true },
        select: ['id', 'secondaryOrder'],
      });

      const slot1 = secondaries.find((a) => a.secondaryOrder === 1);
      const slot2 = secondaries.find((a) => a.secondaryOrder === 2);

      if (!slot1 || !slot2) {
        throw new ConflictException(
          'Swap requires both Secondary-1 and Secondary-2 to be active. ' +
            `Found: ${secondaries.map((a) => `slot ${a.secondaryOrder}`).join(', ') || 'none'}.`,
        );
      }

      await manager.query(
        `UPDATE cloudinary_accounts
            SET secondary_order = CASE
                                    WHEN id = $1 THEN 2
                                    WHEN id = $2 THEN 1
                                  END
          WHERE id IN ($1, $2)`,
        [slot1.id, slot2.id],
      );

      this.logger.log(
        `Secondary slot swap: account ${slot1.id} (slot 1 → 2), ` +
          `account ${slot2.id} (slot 2 → 1) for userId=${userId}`,
      );
    });

    return this.findAllForUser(userId);
  }

  async promote(
    userId: string,
    accountId: string,
  ): Promise<CloudinaryAccountResponseDto[]> {
    await this.dataSource.transaction(async (manager) => {
      const target = await manager.findOne(CloudinaryAccount, {
        where: { id: accountId, userId, isActive: true },
        select: ['id', 'role', 'secondaryOrder'],
      });

      if (!target) {
        throw new NotFoundException(`Cloudinary account ${accountId} not found.`);
      }

      if (target.role === CloudinaryAccountRole.PRIMARY) {
        throw new BadRequestException(
          'This account is already the Primary. Nothing to promote.',
        );
      }

      const promotedSlot = target.secondaryOrder as number;

      const currentPrimary = await manager.findOne(CloudinaryAccount, {
        where: { userId, role: CloudinaryAccountRole.PRIMARY, isActive: true },
        select: ['id'],
      });

      if (!currentPrimary) {
        await manager.update(CloudinaryAccount, accountId, {
          role: CloudinaryAccountRole.PRIMARY,
          secondaryOrder: null,
        });
        this.logger.log(
          `Account ${accountId} promoted to Primary (no prior primary) for userId=${userId}`,
        );
        return;
      }

      // Atomic swap strategy:
      //
      // Both partial unique indexes that protect role/slot uniqueness
      // (uq_user_active_primary, uq_user_active_secondary_slot) are
      // gated by `is_active = true`, and unique indexes in Postgres
      // are checked per-statement (not deferrable). The CHECK constraint
      // chk_role_secondary_order_consistency only permits secondary_order
      // values of 1 or 2, so a temp slot like 99 is illegal.
      //
      // Strategy: temporarily flip the promoted target's is_active to
      // false to step it out of both partial unique indexes. The CHECK
      // constraint is unaffected since it ignores is_active. With the
      // target hidden, we can move the old Primary into the freed slot,
      // then promote the target back to active+Primary. The whole
      // sequence runs inside a single transaction so no partial state
      // is observable outside.

      // Step 1 — hide the promoted target from the partial unique indexes.
      await manager.update(CloudinaryAccount, accountId, { isActive: false });

      // Step 2 — demote current Primary into the now-free slot.
      await manager.update(CloudinaryAccount, currentPrimary.id, {
        role: CloudinaryAccountRole.SECONDARY,
        secondaryOrder: promotedSlot,
      });

      // Step 3 — promote the target, clear its slot, and re-activate.
      await manager.update(CloudinaryAccount, accountId, {
        role: CloudinaryAccountRole.PRIMARY,
        secondaryOrder: null,
        isActive: true,
      });

      this.logger.log(
        `Account ${accountId} promoted to Primary; ` +
          `account ${currentPrimary.id} demoted to Secondary slot ${promotedSlot} ` +
          `for userId=${userId}`,
      );
    });

    return this.findAllForUser(userId);
  }

  async deactivate(
    userId: string,
    accountId: string,
    force: boolean,
  ): Promise<{ deactivated: boolean; orphanedMediaCount: number; message: string }> {
    const account = await this.repo.findOne({
      where: { id: accountId, userId, isActive: true },
      select: ['id', 'role', 'cloudName'],
    });

    if (!account) {
      throw new NotFoundException(`Cloudinary account ${accountId} not found.`);
    }

    if (account.role === CloudinaryAccountRole.PRIMARY) {
      throw new ConflictException(
        'Cannot delete the active Primary account. ' +
          'Promote a Secondary to Primary first.',
      );
    }

    const linkedMediaCount = await this.mediaRepo.count({
      where: { cloudinaryAccountId: accountId, isOrphaned: false },
    });

    if (linkedMediaCount > 0 && !force) {
      throw new ConflictException(
        `Account "${account.cloudName}" has ${linkedMediaCount} media item(s). ` +
          'Pass force=true to deactivate and orphan them.',
      );
    }

    let orphanedMediaCount = 0;

    await this.dataSource.transaction(async (manager) => {
      if (linkedMediaCount > 0 && force) {
        const result = await manager
          .createQueryBuilder()
          .update(Media)
          .set({ isOrphaned: true })
          .where(
            'cloudinary_account_id = :accountId AND is_orphaned = false',
            { accountId },
          )
          .execute();

        orphanedMediaCount = result.affected ?? linkedMediaCount;
      }

      await manager.update(CloudinaryAccount, accountId, { isActive: false });
    });

    this.logger.log(
      `Account ${accountId} deactivated for userId=${userId}` +
        (orphanedMediaCount > 0 ? `; ${orphanedMediaCount} media item(s) orphaned` : ''),
    );

    return {
      deactivated: true,
      orphanedMediaCount,
      message:
        orphanedMediaCount > 0
          ? `Account deactivated. ${orphanedMediaCount} media item(s) marked as orphaned.`
          : 'Account deactivated.',
    };
  }

  async listActiveAccountsForReconciliation(
    offset: number,
    limit: number,
  ): Promise<CloudinaryAccountReconciliationRow[]> {
    return this.repo.find({
      where: { isActive: true },
      select: [
        'id',
        'cloudName',
        'apiKey',
        'apiSecretEncrypted',
        'storageUsedBytes',
        'isActive',
      ],
      order: {
        createdAt: 'ASC',
        id: 'ASC',
      },
      skip: offset,
      take: limit,
    });
  }

  buildAdminApiCredentials(
    account: Pick<
      CloudinaryAccountReconciliationRow,
      'cloudName' | 'apiKey' | 'apiSecretEncrypted'
    >,
  ) {
    return {
      cloudName: account.cloudName,
      apiKey: account.apiKey,
      apiSecret: this.aesGcm.decrypt(account.apiSecretEncrypted),
    };
  }

  async applyStorageReconciliation(
    accountId: string,
    actualStorageUsedBytes: string,
    reconciledAt: Date,
  ): Promise<CloudinaryAccountReconciliationResult | null> {
    const account = await this.repo.findOne({
      where: { id: accountId, isActive: true },
      select: ['id', 'storageUsedBytes', 'lastReconciledAt', 'isActive'],
    });

    if (!account) {
      return null;
    }

    const previousStorageUsedBytes = account.storageUsedBytes;
    const corrected = previousStorageUsedBytes !== actualStorageUsedBytes;

    account.storageUsedBytes = actualStorageUsedBytes;
    account.lastReconciledAt = reconciledAt;
    await this.repo.save(account);

    return {
      accountId: account.id,
      previousStorageUsedBytes,
      actualStorageUsedBytes,
      corrected,
      lastReconciledAt: reconciledAt,
    };
  }

  async create(
    userId: string,
    dto: CreateCloudinaryAccountDto,
  ): Promise<CloudinaryAccountResponseDto> {
    await this.verifier.verifyCredentials({
      cloudName: dto.cloudName,
      apiKey: dto.apiKey,
      apiSecret: dto.apiSecret,
    });

    const activePrimary = await this.repo.findOne({
      where: { userId, role: CloudinaryAccountRole.PRIMARY, isActive: true },
      select: ['id'],
    });

    let role: CloudinaryAccountRole;
    let secondaryOrder: number | null = null;

    if (!activePrimary) {
      role = CloudinaryAccountRole.PRIMARY;
    } else {
      role = CloudinaryAccountRole.SECONDARY;

      const usedSlots = await this.repo.find({
        where: { userId, role: CloudinaryAccountRole.SECONDARY, isActive: true },
        select: ['secondaryOrder'],
      });

      const taken = new Set(usedSlots.map((a) => a.secondaryOrder));

      if (!taken.has(1)) {
        secondaryOrder = 1;
      } else if (!taken.has(2)) {
        secondaryOrder = 2;
      } else {
        throw new ConflictException(
          'You already have two active secondary Cloudinary accounts. ' +
            'Remove one before adding another.',
        );
      }
    }

    const apiSecretEncrypted = this.aesGcm.encrypt(dto.apiSecret);

    const account = this.repo.create({
      userId,
      cloudName: dto.cloudName,
      apiKey: dto.apiKey,
      apiSecretEncrypted,
      role,
      secondaryOrder,
      storageUsedBytes: '0',
      storageLimitBytes: DEFAULT_STORAGE_LIMIT_BYTES.toString(),
      isActive: true,
      lastReconciledAt: null,
    });

    const saved = await this.repo.save(account);

    this.logger.log(
      `Cloudinary account added: id=${saved.id} userId=${userId} role=${role}` +
        (secondaryOrder !== null ? ` slot=${secondaryOrder}` : ''),
    );

    return new CloudinaryAccountResponseDto(saved);
  }
}
