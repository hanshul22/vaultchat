export const JOB_QUEUE_NAMES = {
  STORAGE_RECALC: 'storage-recalc',
  MEDIA_CLEANUP: 'media-cleanup',
  VIDEO_DOWNLOAD: 'video-download',
} as const;

export const STORAGE_RECALC_JOB_NAME = 'storage-recalc.run';
export const STORAGE_RECALC_JOB_ID = 'storage-recalc.hourly';
export const STORAGE_RECALC_BATCH_SIZE = 100;
