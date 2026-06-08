import { IsInt, IsString, Min } from 'class-validator';

export class InitDirectUploadDto {
  @IsInt()
  @Min(1)
  fileSizeBytes!: number;

  @IsString()
  mimeType!: string;

  @IsString()
  filename!: string;
}
