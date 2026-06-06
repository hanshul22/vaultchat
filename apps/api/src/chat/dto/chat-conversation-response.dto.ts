/** Lightweight user summary embedded in conversation and message responses. */
export class ChatUserSummaryDto {
  id!: string;
  email!: string;
  fullName!: string;
}

/** Lightweight media summary embedded in message responses. */
export class ChatMediaSummaryDto {
  id!: string;
  url!: string;
  mimeType!: string;
  /** File size in bytes (string because the DB column is BIGINT). */
  sizeBytes!: string;
  width!: number | null;
  height!: number | null;
  durationSeconds!: string | null;
  orderIndex!: number | null;
}

/** Minimal message summary used as the `lastMessage` field on a conversation. */
export class ChatLastMessageSummaryDto {
  id!: string;
  body!: string;
  senderId!: string;
  createdAt!: Date;
}

/** Full conversation response returned by POST and GET list endpoints. */
export class ChatConversationResponseDto {
  id!: string;
  name!: string | null;
  isGroup!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
  memberCount!: number;
  members!: ChatUserSummaryDto[];
  /** Most recent message in the conversation, if any. */
  lastMessage!: ChatLastMessageSummaryDto | null;
  /**
   * Number of messages the current user has not yet read.
   * Derived from conversation_members.last_read_message_id.
   */
  unreadCount!: number;
}
