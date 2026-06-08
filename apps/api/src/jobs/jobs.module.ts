import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { CloudinaryAccountsModule } from '../cloudinary-accounts/cloudinary-accounts.module';
import { JOB_QUEUE_NAMES } from './jobs.constants';
import { StorageRecalcProcessor } from './storage-recalc/storage-recalc.processor';
import { StorageRecalcScheduler } from './storage-recalc/storage-recalc.scheduler';
import { StorageRecalcService } from './storage-recalc/storage-recalc.service';

@Module({
  imports: [
    CloudinaryAccountsModule,
    BullModule.registerQueue({
      name: JOB_QUEUE_NAMES.STORAGE_RECALC,
    }),
  ],
  providers: [
    StorageRecalcService,
    StorageRecalcScheduler,
    StorageRecalcProcessor,
  ],
  exports: [BullModule, StorageRecalcService],
})
export class JobsModule {}
