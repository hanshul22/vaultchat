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
