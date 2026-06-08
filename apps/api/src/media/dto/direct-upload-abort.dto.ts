import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString, IsUUID, ValidateNested } from 'class-validator';

class DirectUploadAbortPartDto {
  @IsString()
  publicId!: string;
}

export class DirectUploadAbortDto {
  @IsUUID('4', { message: 'mediaId must be a valid UUID v4.' })
  mediaId!: string;

  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => DirectUploadAbortPartDto)
  uploadedParts!: DirectUploadAbortPartDto[];
}
