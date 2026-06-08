import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';

import {
  JOB_QUEUE_NAMES,
  STORAGE_RECALC_JOB_ID,
  STORAGE_RECALC_JOB_NAME,
} from '../jobs.constants';

@Injectable()
export class StorageRecalcScheduler {
  private readonly logger = new Logger(StorageRecalcScheduler.name);

  constructor(
    @InjectQueue(JOB_QUEUE_NAMES.STORAGE_RECALC)
    private readonly storageRecalcQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async enqueueHourlyStorageRecalc(): Promise<void> {
    const existingJob = await this.storageRecalcQueue.getJob(
      STORAGE_RECALC_JOB_ID,
    );

    if (existingJob) {
      return;
    }

    await this.storageRecalcQueue.add(
      STORAGE_RECALC_JOB_NAME,
      {},
      {
        jobId: STORAGE_RECALC_JOB_ID,
        removeOnComplete: true,
      },
    );

    this.logger.debug(`Enqueued ${STORAGE_RECALC_JOB_NAME} job.`);
  }
}
