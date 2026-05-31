import { UserSummary } from './user.model';

export interface MediaAttachment {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: string;
  width: number | null;
  height: number | null;
  durationSeconds: string | null;
  orderIndex: number | null;
}

export interface Message {
  id: string;
  conversationId: string;
  body: string;
  sender: UserSummary;
  media: MediaAttachment[];
  createdAt: string;
}

export interface MessageListResponse {
  items: Message[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
