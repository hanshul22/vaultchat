export type UploadTaskPhase =
  | 'queued'
  | 'probing'
  | 'preflight'
  | 'compressing'
  | 'splitting'
  | 'uploading'
  | 'finalizing'
  | 'failed'
  | 'completed';

export type UploadTaskPreflightStatus = 'idle' | 'running' | 'completed';

export type UploadTaskSessionStatus = 'idle' | 'initialized';

export interface UploadTaskState {
  phase: UploadTaskPhase;
  preflightStatus: UploadTaskPreflightStatus;
  sessionStatus: UploadTaskSessionStatus;
  currentPartIndex: number | null;
  totalParts: number | null;
  errorMessage?: string;
  startedAt: string;
  updatedAt: string;
}
