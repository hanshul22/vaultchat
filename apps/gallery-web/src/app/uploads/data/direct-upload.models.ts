import { MediaUploadResponse } from '../../core/models/media-upload-response.model';

export type DirectUploadTargetAccountRole = 'primary' | 'secondary';

export type DirectUploadPreflightRejectReason =
  | 'VAULT_FULL'
  | 'FILE_TOO_LARGE_FOR_ANY_ACCOUNT';

export interface UploadPreflightRequest {
  fileSizeBytes: number;
  mimeType: string;
}

interface DirectUploadCapacityHints {
  largestFreeSlotBytes?: string;
  vaultFreeBytes?: string;
}

export interface DirectUploadPreflightSuccessResponse extends DirectUploadCapacityHints {
  canUpload: true;
  cloudName: string;
  uploadFolder: string;
  targetAccountId: string;
  targetAccountRole: DirectUploadTargetAccountRole;
  targetSecondaryOrder: number | null;
}

export interface DirectUploadPreflightFailureResponse extends DirectUploadCapacityHints {
  canUpload: false;
  reason: DirectUploadPreflightRejectReason;
}

export type UploadPreflightResponse =
  | DirectUploadPreflightSuccessResponse
  | DirectUploadPreflightFailureResponse;

export interface DirectUploadInitRequest {
  mediaId: string;
  totalFileSize: number;
  totalParts: number;
  mimeType: string;
}

export interface DirectUploadInitResponse {
  uploadId: string;
  cloudName: string;
  apiKey: string;
  signature: string;
  timestamp: number;
  folder: string;
  publicIdPattern: string;
  maxChunkSizeBytes: number;
}

export interface DirectUploadSignPartRequest {
  mediaId: string;
  partIndex: number;
  totalParts: number;
}

export interface DirectUploadSignPartResponse {
  signature: string;
  timestamp: number;
  publicId: string;
  apiKey: string;
  cloudName: string;
}

export interface DirectUploadCompletionPart {
  partIndex: number;
  publicId: string;
  sizeBytes: number;
}

export interface DirectUploadCompleteRequest {
  mediaId: string;
  parts: DirectUploadCompletionPart[];
  compressedTotalBytes: number;
}

export type DirectUploadCompleteResponse = MediaUploadResponse;

export interface DirectUploadAbortUploadedPart {
  publicId: string;
}

export interface DirectUploadAbortRequest {
  mediaId: string;
  uploadedParts: DirectUploadAbortUploadedPart[];
}

export interface DirectUploadAbortResponse {
  success: true;
}

export interface DirectUploadUploadedPartMetadata extends DirectUploadCompletionPart {
  cloudName: string;
  uploadId: string;
  secureUrl: string;
  resourceType: string;
  etag?: string | null;
}

export interface DirectUploadSession {
  uploadId: string;
  cloudName: string;
  apiKey: string;
  signature: string;
  timestamp: number;
  folder: string;
  uploadFolder: string;
  publicIdPattern: string;
  maxChunkSizeBytes: number;
  targetAccountId: string;
  targetAccountRole: DirectUploadTargetAccountRole;
  targetSecondaryOrder: number | null;
}
