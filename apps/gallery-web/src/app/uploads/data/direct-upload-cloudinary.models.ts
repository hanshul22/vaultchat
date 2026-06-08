export interface DirectUploadCloudinaryResponse {
  asset_id: string;
  public_id: string;
  version: number;
  signature: string;
  resource_type: string;
  created_at: string;
  bytes: number;
  etag?: string;
  url: string;
  secure_url: string;
  original_filename?: string;
  done?: boolean;
}
