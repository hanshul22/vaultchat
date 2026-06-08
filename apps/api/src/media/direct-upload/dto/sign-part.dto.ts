import { IsInt, IsUUID, Min } from 'class-validator';

export class SignPartDto {
  @IsUUID()
  uploadId!: string;

  @IsInt()
  @Min(0)
  partIndex!: number;
}
