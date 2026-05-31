import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateStorageSpaceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(500)
  description?: string;
}
