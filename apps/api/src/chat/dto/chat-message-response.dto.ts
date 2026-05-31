import { ChatMediaSummaryDto, ChatUserSummaryDto } from './chat-conversation-response.dto';

/** Full message response returned by GET messages and POST send-message. */
export class ChatMessageResponseDto {
  id!: string;
  conversationId!: string;
  body!: string;
  sender!: ChatUserSummaryDto;
  /** Media attachments in the order the sender chose (orderIndex ASC). */
  media!: ChatMediaSummaryDto[];
  createdAt!: Date;
}

/** Paginated wrapper for message list responses. */
export class ChatMessageListResponseDto {
  /**
   * Messages ordered oldest-first within the page so the UI can render
   * them in chronological order without reversing.
   */
  items!: ChatMessageResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
  totalPages!: number;
}
