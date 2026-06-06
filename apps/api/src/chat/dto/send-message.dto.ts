import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SendMessageDto {
  /**
   * Message text. May be empty string only when at least one mediaId is
   * provided. Max 10 000 chars per PRD §7.2.
   */
  @IsString()
  @MaxLength(10000)
  body!: string;

  /**
   * IDs of existing Media rows to attach. Each must be owned by the
   * sender. Optional — omit or send an empty array for text-only messages.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  mediaIds?: string[];
}
