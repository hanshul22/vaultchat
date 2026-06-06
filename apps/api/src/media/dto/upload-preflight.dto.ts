import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

/** 100 MB per-file ceiling (PRD §6.1). Shared with the upload guard. */
export const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;

/**
 * Body for POST /api/v1/media/upload/preflight.
 *
 * The UI calls this before starting a large upload to get a deterministic
 * yes/no answer (and the target account) without consuming any quota.
 *
 * `mimeType` is validated against the allowlist inside the service so the
 * preflight gives the same 415-equivalent answer the real upload would.
 */
export class UploadPreflightDto {
  /** Declared size of the file the UI intends to upload, in bytes. */
  @Type(() => Number)
  @IsInt({ message: 'fileSizeBytes must be an integer number of bytes.' })
  @Min(1, { message: 'fileSizeBytes must be at least 1 byte.' })
  @Max(MAX_UPLOAD_SIZE_BYTES, {
    message: `fileSizeBytes must not exceed ${MAX_UPLOAD_SIZE_BYTES} bytes (100 MB).`,
  })
  fileSizeBytes!: number;

  /** Declared MIME type, e.g. "image/jpeg" or "video/mp4". */
  @IsString()
  @IsNotEmpty()
  mimeType!: string;
}
