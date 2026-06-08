import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class DirectUploadCompletePartDto {
  @Type(() => Number)
  @IsInt({ message: 'parts.partIndex must be an integer.' })
  @Min(0, { message: 'parts.partIndex must be 0 or greater.' })
  partIndex!: number;

  @IsString()
  publicId!: string;

  @Type(() => Number)
  @IsInt({ message: 'parts.sizeBytes must be an integer number of bytes.' })
  @Min(1, { message: 'parts.sizeBytes must be at least 1 byte.' })
  sizeBytes!: number;
}

export class DirectUploadCompleteDto {
  @IsUUID('4', { message: 'mediaId must be a valid UUID v4.' })
  mediaId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'parts must contain at least one uploaded part.' })
  @ValidateNested({ each: true })
  @Type(() => DirectUploadCompletePartDto)
  parts!: DirectUploadCompletePartDto[];

  @Type(() => Number)
  @IsInt({ message: 'compressedTotalBytes must be an integer number of bytes.' })
  @Min(1, { message: 'compressedTotalBytes must be at least 1 byte.' })
  compressedTotalBytes!: number;
}
