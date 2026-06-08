import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { JOB_QUEUE_NAMES } from '../jobs.constants';
import {
  StorageRecalcRunResult,
  StorageRecalcService,
} from './storage-recalc.service';

@Processor(JOB_QUEUE_NAMES.STORAGE_RECALC)
export class StorageRecalcProcessor extends WorkerHost {
  private readonly logger = new Logger(StorageRecalcProcessor.name);

  constructor(private readonly storageRecalcService: StorageRecalcService) {
    super();
  }

  async process(job: Job): Promise<StorageRecalcRunResult> {
    this.logger.log(`Starting storage recalc job id=${job.id ?? 'unknown'}.`);

    try {
      const result = await this.storageRecalcService.recalculateAllActiveAccounts();
      this.logger.log(
        `Completed storage recalc job id=${job.id ?? 'unknown'} corrected=${result.correctedCount}.`,
      );
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Storage recalc job failed id=${job.id ?? 'unknown'}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }
}
