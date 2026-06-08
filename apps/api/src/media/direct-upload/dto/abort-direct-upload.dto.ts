import { IsUUID } from 'class-validator';

export class AbortDirectUploadDto {
  @IsUUID()
  uploadId!: string;
}
