import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Body for PATCH /api/albums/:id.
 *
 * Semantics:
 *   - Omitted field  → no change to that column.
 *   - Explicit null  → clears the column (description, coverMediaId).
 *   - name cannot be set to null; omit it to leave it unchanged.
 */
export class UpdateAlbumDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'name must not be empty.' })
  @MaxLength(120, { message: 'name must not exceed 120 characters.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  /** Explicit null clears the description. */
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'description must not exceed 2000 characters.' })
  description?: string | null;

  /**
   * Explicit null clears the cover. A UUID value must reference a media item
   * owned by the requesting user — validated in the service layer.
   */
  @IsOptional()
  @IsUUID('4', { message: 'coverMediaId must be a valid UUID.' })
  coverMediaId?: string | null;
}
