import { Job, Queue } from 'bullmq';

import {
  CloudinaryAccountsService,
  CloudinaryAccountReconciliationRow,
} from '../../cloudinary-accounts/cloudinary-accounts.service';
import { CloudinaryUploaderService } from '../../common/cloudinary/cloudinary-uploader.service';
import {
  STORAGE_RECALC_JOB_ID,
  STORAGE_RECALC_JOB_NAME,
} from '../jobs.constants';
import { StorageRecalcProcessor } from './storage-recalc.processor';
import { StorageRecalcScheduler } from './storage-recalc.scheduler';
import { StorageRecalcService } from './storage-recalc.service';

describe('StorageRecalcService', () => {
  let service: StorageRecalcService;
  let accountsService: {
    listActiveAccountsForReconciliation: jest.Mock;
    buildAdminApiCredentials: jest.Mock;
    applyStorageReconciliation: jest.Mock;
  };
  let uploaderService: {
    fetchUsage: jest.Mock;
  };

  const activeAccount = (
    overrides: Partial<CloudinaryAccountReconciliationRow> = {},
  ): CloudinaryAccountReconciliationRow => ({
    id: 'account-1',
    cloudName: 'demo-cloud',
    apiKey: 'key-1',
    apiSecretEncrypted: 'ciphertext',
    storageUsedBytes: '100',
    isActive: true,
    ...overrides,
  });

  beforeEach(() => {
    accountsService = {
      listActiveAccountsForReconciliation: jest.fn(),
      buildAdminApiCredentials: jest.fn(),
      applyStorageReconciliation: jest.fn(),
    };
    uploaderService = {
      fetchUsage: jest.fn(),
    };

    service = new StorageRecalcService(
      accountsService as unknown as CloudinaryAccountsService,
      uploaderService as unknown as CloudinaryUploaderService,
    );
  });

  it('corrects drift when Cloudinary usage differs', async () => {
    const account = activeAccount();
    const reconciledAt = new Date('2026-06-06T01:00:00.000Z');

    accountsService.listActiveAccountsForReconciliation
      .mockResolvedValueOnce([account])
      .mockResolvedValueOnce([]);
    accountsService.buildAdminApiCredentials.mockReturnValue({
      cloudName: account.cloudName,
      apiKey: account.apiKey,
      apiSecret: 'secret',
    });
    uploaderService.fetchUsage.mockResolvedValue({ storageUsedBytes: '150' });
    accountsService.applyStorageReconciliation.mockImplementation(
      async (_accountId: string, _actualBytes: string, at: Date) => ({
        accountId: account.id,
        previousStorageUsedBytes: '100',
        actualStorageUsedBytes: '150',
        corrected: true,
        lastReconciledAt: at,
      }),
    );

    jest.useFakeTimers().setSystemTime(reconciledAt);
    const result = await service.recalculateAllActiveAccounts(10);
    jest.useRealTimers();

    expect(accountsService.applyStorageReconciliation).toHaveBeenCalledWith(
      account.id,
      '150',
      reconciledAt,
    );
    expect(result).toEqual({
      processedCount: 1,
      correctedCount: 1,
      skippedCount: 0,
    });
  });

  it('updates reconciliation timestamp even when no drift exists', async () => {
    const account = activeAccount();
    const reconciledAt = new Date('2026-06-06T02:00:00.000Z');

    accountsService.listActiveAccountsForReconciliation
      .mockResolvedValueOnce([account])
      .mockResolvedValueOnce([]);
    accountsService.buildAdminApiCredentials.mockReturnValue({
      cloudName: account.cloudName,
      apiKey: account.apiKey,
      apiSecret: 'secret',
    });
    uploaderService.fetchUsage.mockResolvedValue({ storageUsedBytes: '100' });
    accountsService.applyStorageReconciliation.mockImplementation(
      async (_accountId: string, _actualBytes: string, at: Date) => ({
        accountId: account.id,
        previousStorageUsedBytes: '100',
        actualStorageUsedBytes: '100',
        corrected: false,
        lastReconciledAt: at,
      }),
    );

    jest.useFakeTimers().setSystemTime(reconciledAt);
    const result = await service.recalculateAllActiveAccounts(10);
    jest.useRealTimers();

    expect(accountsService.applyStorageReconciliation).toHaveBeenCalledWith(
      account.id,
      '100',
      reconciledAt,
    );
    expect(result).toEqual({
      processedCount: 1,
      correctedCount: 0,
      skippedCount: 0,
    });
  });

  it('skips inactive accounts', async () => {
    const inactiveAccount = activeAccount({
      id: 'account-2',
      isActive: false,
    });

    accountsService.listActiveAccountsForReconciliation
      .mockResolvedValueOnce([inactiveAccount])
      .mockResolvedValueOnce([]);

    const result = await service.recalculateAllActiveAccounts(10);

    expect(accountsService.buildAdminApiCredentials).not.toHaveBeenCalled();
    expect(uploaderService.fetchUsage).not.toHaveBeenCalled();
    expect(accountsService.applyStorageReconciliation).not.toHaveBeenCalled();
    expect(result).toEqual({
      processedCount: 0,
      correctedCount: 0,
      skippedCount: 1,
    });
  });
});

describe('StorageRecalcScheduler', () => {
  it('enqueues the hourly job once with a stable job id', async () => {
    const queue = {
      getJob: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: STORAGE_RECALC_JOB_ID }),
      add: jest.fn(),
    };
    const scheduler = new StorageRecalcScheduler(queue as unknown as Queue);

    await scheduler.enqueueHourlyStorageRecalc();
    await scheduler.enqueueHourlyStorageRecalc();

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      STORAGE_RECALC_JOB_NAME,
      {},
      expect.objectContaining({
        jobId: STORAGE_RECALC_JOB_ID,
        removeOnComplete: true,
      }),
    );
  });
});

describe('StorageRecalcProcessor', () => {
  it('delegates queued work to the storage recalc service', async () => {
    const recalcResult = {
      processedCount: 3,
      correctedCount: 1,
      skippedCount: 0,
    };
    const storageRecalcService = {
      recalculateAllActiveAccounts: jest.fn().mockResolvedValue(recalcResult),
    };
    const processor = new StorageRecalcProcessor(
      storageRecalcService as unknown as StorageRecalcService,
    );

    const result = await processor.process({ id: 'job-123' } as Job);

    expect(storageRecalcService.recalculateAllActiveAccounts).toHaveBeenCalledTimes(1);
    expect(result).toEqual(recalcResult);
  });
});
