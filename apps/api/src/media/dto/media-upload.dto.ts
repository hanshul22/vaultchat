import { IsOptional, IsUUID } from 'class-validator';

/**
 * Optional multipart form-data metadata that may accompany the binary file on
 * POST /api/v1/media/upload. The file itself arrives as the `file` part and is
 * handled by the FileInterceptor — not by this DTO.
 *
 * Phase 7 keeps this minimal: a user may target a shared storage space so the
 * resulting media row carries `storage_space_id` (PRD §9). Album linking and
 * richer metadata are handled by their own modules in later phases.
 */
export class MediaUploadDto {
  /**
   * When present, the upload is filed inside this shared storage space.
   * Space-level permissions then govern access alongside ownership.
   */
  @IsOptional()
  @IsUUID('4', { message: 'storageSpaceId must be a valid UUID.' })
  storageSpaceId?: string;
}
