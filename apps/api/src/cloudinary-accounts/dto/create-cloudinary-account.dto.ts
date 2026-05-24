import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CloudinaryAccountRole } from '../entities/cloudinary-account.entity';

export class CreateCloudinaryAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cloudName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  apiKey!: string;

  /**
   * The raw API secret. Encrypted server-side before persisting;
   * never stored in plaintext, never returned in responses.
   */
  @IsString()
  @IsNotEmpty()
  apiSecret!: string;

  /**
   * Requested role. The server may override this:
   * - If the user has no active Primary, the account is always saved as Primary.
   * - If a Primary already exists, it is always saved as Secondary.
   */
  @IsOptional()
  @IsEnum(CloudinaryAccountRole)
  role?: CloudinaryAccountRole;
}
