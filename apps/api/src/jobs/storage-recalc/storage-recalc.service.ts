import { Injectable, Logger } from '@nestjs/common';

import { CloudinaryUploaderService } from '../../common/cloudinary/cloudinary-uploader.service';
import {
  CloudinaryAccountsService,
  CloudinaryAccountReconciliationRow,
} from '../../cloudinary-accounts/cloudinary-accounts.service';
import { STORAGE_RECALC_BATCH_SIZE } from '../jobs.constants';

export interface StorageRecalcRunResult {
  processedCount: number;
  correctedCount: number;
  skippedCount: number;
}

@Injectable()
export class StorageRecalcService {
  private readonly logger = new Logger(StorageRecalcService.name);

  constructor(
    private readonly cloudinaryAccountsService: CloudinaryAccountsService,
    private readonly cloudinaryUploaderService: CloudinaryUploaderService,
  ) {}

  async recalculateAllActiveAccounts(
    batchSize = STORAGE_RECALC_BATCH_SIZE,
  ): Promise<StorageRecalcRunResult> {
    let offset = 0;
    let processedCount = 0;
    let correctedCount = 0;
    let skippedCount = 0;

    while (true) {
      const accounts = await this.cloudinaryAccountsService.listActiveAccountsForReconciliation(
        offset,
        batchSize,
      );

      if (accounts.length === 0) {
        break;
      }

      for (const account of accounts) {
        const outcome = await this.reconcileAccount(account);

        if (outcome === 'processed') {
          processedCount += 1;
        } else if (outcome === 'corrected') {
          processedCount += 1;
          correctedCount += 1;
        } else {
          skippedCount += 1;
        }
      }

      offset += accounts.length;
    }

    return { processedCount, correctedCount, skippedCount };
  }

  private async reconcileAccount(
    account: CloudinaryAccountReconciliationRow,
  ): Promise<'processed' | 'corrected' | 'skipped'> {
    if (!account.isActive) {
      return 'skipped';
    }

    const credentials =
      this.cloudinaryAccountsService.buildAdminApiCredentials(account);
    const usage = await this.cloudinaryUploaderService.fetchUsage(credentials);
    const reconciledAt = new Date();
    const result =
      await this.cloudinaryAccountsService.applyStorageReconciliation(
        account.id,
        usage.storageUsedBytes,
        reconciledAt,
      );

    if (!result) {
      return 'skipped';
    }

    if (result.corrected) {
      this.logger.warn(
        `Storage drift corrected for accountId=${account.id} cloudName=${account.cloudName} ` +
          `local=${result.previousStorageUsedBytes} remote=${result.actualStorageUsedBytes}`,
      );
      return 'corrected';
    }

    return 'processed';
  }
}
