import { IsString, IsUUID, IsInt, Min, IsOptional } from 'class-validator';

export class CompleteDirectUploadDto {
  @IsUUID()
  uploadId!: string;

  @IsString()
  cloudinaryPublicId!: string;

  @IsInt()
  @Min(1)
  finalSizeBytes!: number;

  @IsString()
  @IsOptional()
  duration?: string; // seconds as string, videos only

  @IsInt()
  @Min(0)
  @IsOptional()
  width?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  height?: number;
}
