import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class DirectUploadSignPartDto {
  @IsUUID('4', { message: 'mediaId must be a valid UUID v4.' })
  mediaId!: string;

  @Type(() => Number)
  @IsInt({ message: 'partIndex must be an integer.' })
  @Min(0, { message: 'partIndex must be 0 or greater.' })
  partIndex!: number;

  @Type(() => Number)
  @IsInt({ message: 'totalParts must be an integer.' })
  @Min(1, { message: 'totalParts must be at least 1.' })
  totalParts!: number;
}
