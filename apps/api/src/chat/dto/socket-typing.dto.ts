import { IsUUID } from 'class-validator';

/** Payload for `chat:typing-start` and `chat:typing-stop` WebSocket events. */
export class SocketTypingDto {
  @IsUUID('4')
  conversationId!: string;
}
