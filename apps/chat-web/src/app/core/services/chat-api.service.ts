import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Conversation } from '../models/conversation.model';
import { Message, MessageListResponse } from '../models/message.model';

const BASE = '/api/v1/chat';

@Injectable({ providedIn: 'root' })
export class ChatApiService {
  private readonly http = inject(HttpClient);

  // ── Conversations ─────────────────────────────────────────────────────────

  listConversations(page = 1, limit = 20): Observable<Conversation[]> {
    return this.http.get<Conversation[]>(`${BASE}/conversations`, {
      params: { page: String(page), limit: String(limit) },
    });
  }

  createConversation(
    participantIds: string[],
    isGroup: boolean,
    name?: string,
  ): Observable<Conversation> {
    return this.http.post<Conversation>(`${BASE}/conversations`, {
      participantIds,
      isGroup,
      ...(name ? { name } : {}),
    });
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  listMessages(conversationId: string, page = 1, limit = 50): Observable<MessageListResponse> {
    return this.http.get<MessageListResponse>(`${BASE}/conversations/${conversationId}/messages`, {
      params: { page: String(page), limit: String(limit) },
    });
  }

  /** REST fallback for sending a message (primary path is WebSocket). */
  sendMessage(conversationId: string, body: string, mediaIds?: string[]): Observable<Message> {
    return this.http.post<Message>(`${BASE}/conversations/${conversationId}/messages`, {
      body,
      ...(mediaIds?.length ? { mediaIds } : {}),
    });
  }
}
