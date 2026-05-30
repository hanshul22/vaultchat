import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateAlbumDto {
  /** Album display name. Required, trimmed, max 120 chars (Album entity §). */
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty.' })
  @MaxLength(120, { message: 'name must not exceed 120 characters.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  /** Optional free-text description. Explicit null clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'description must not exceed 2000 characters.' })
  description?: string | null;

  /**
   * Optional cover image. Must be a UUID referencing a media item owned by
   * the requesting user — validated in the service layer.
   */
  @IsOptional()
  @IsUUID('4', { message: 'coverMediaId must be a valid UUID.' })
  coverMediaId?: string | null;
}
