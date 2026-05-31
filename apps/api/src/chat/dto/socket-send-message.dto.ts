import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Payload for the `chat:send-message` WebSocket event. */
export class SocketSendMessageDto {
  @IsUUID('4')
  conversationId!: string;

  /**
   * Message text. May be empty string only when at least one mediaId is
   * provided. Max 10 000 chars per PRD §7.2.
   */
  @IsString()
  @MaxLength(10000)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  mediaIds?: string[];
}
