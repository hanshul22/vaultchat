import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, IsUUID, Min } from 'class-validator';

export class DirectUploadInitDto {
  @IsUUID('4', { message: 'mediaId must be a valid UUID v4.' })
  mediaId!: string;

  @Type(() => Number)
  @IsInt({ message: 'totalFileSize must be an integer number of bytes.' })
  @Min(1, { message: 'totalFileSize must be at least 1 byte.' })
  totalFileSize!: number;

  @Type(() => Number)
  @IsInt({ message: 'totalParts must be an integer.' })
  @Min(1, { message: 'totalParts must be at least 1.' })
  totalParts!: number;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;
}
