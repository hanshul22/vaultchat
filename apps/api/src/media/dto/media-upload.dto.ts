import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * Optional multipart form-data metadata that may accompany the binary file on
 * POST /api/v1/media/upload. The file itself arrives as the `file` part and is
 * handled by the FileInterceptor — not by this DTO.
 *
 * Single-part uploads (the common case) may omit all multipart fields; the
 * service defaults partIndex to 0 and totalParts to 1.
 *
 * Multipart (chunked) uploads must supply all four multipart fields on every
 * chunk so the service can:
 *   - Reserve storage on partIndex 0 using totalFileSize.
 *   - Save a MediaPart row for each chunk.
 *   - Commit the Media row on the final chunk (partIndex === totalParts - 1).
 */
export class MediaUploadDto {
  /**
   * When present, the upload is filed inside this shared storage space.
   * Space-level permissions then govern access alongside ownership.
   */
  @IsOptional()
  @IsUUID('4', { message: 'storageSpaceId must be a valid UUID.' })
  storageSpaceId?: string;

  // ── Multipart fields ───────────────────────────────────────────────────────

  /**
   * Client-generated UUID that ties all chunks of one logical media item.
   * Required for multipart uploads; omitted for single-part uploads.
   */
  @IsOptional()
  @IsUUID('4', { message: 'mediaId must be a valid UUID v4.' })
  mediaId?: string;

  /**
   * 0-based index of this chunk within the logical file.
   * Defaults to 0 (single-part upload).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'partIndex must be an integer.' })
  @Min(0, { message: 'partIndex must be 0 or greater.' })
  partIndex?: number;

  /**
   * Total number of chunks for this logical file.
   * Defaults to 1 (single-part upload).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'totalParts must be an integer.' })
  @Min(1, { message: 'totalParts must be at least 1.' })
  totalParts?: number;

  /**
   * Total byte size of the original (unsplit) file.
   * Used on partIndex 0 to reserve the full logical file size from the Vault,
   * so capacity is checked against the complete file rather than a single chunk.
   * Must be a positive integer (bytes, never MB or floats).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'totalFileSize must be an integer.' })
  @Min(1, { message: 'totalFileSize must be at least 1 byte.' })
  totalFileSize?: number;
}
