import { UserSummary } from './user.model';

export interface LastMessageSummary {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  name: string | null;
  isGroup: boolean;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  members: UserSummary[];
  lastMessage: LastMessageSummary | null;
  unreadCount: number;
}
