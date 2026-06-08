import { MediaUploadResponse } from '../../core/models/media-upload-response.model';

import {
  DirectUploadSession,
  DirectUploadUploadedPartMetadata,
  UploadPreflightResponse,
} from './direct-upload.models';
import { UploadTaskState } from './upload-state.model';

export interface UploadTaskPartInput {
  file: File;
  partIndex: number;
  totalParts: number;
  sizeBytes: number;
}

export interface ExecuteDirectUploadOptions {
  processedFile?: File | null;
  parts?: readonly UploadTaskPartInput[] | null;
}

export interface UploadTask {
  clientId: string;
  mediaId: string;
  filename: string;
  mimeType: string;
  originalTotalBytes: number;
  totalParts: number;
  uploadedParts: DirectUploadUploadedPartMetadata[];
  compressedTotalBytes: number | null;
  preflightResult: UploadPreflightResponse | null;
  directUploadSession: DirectUploadSession | null;
  completedMedia: MediaUploadResponse | null;
  state: UploadTaskState;
  createdAt: string;
  updatedAt: string;
}
