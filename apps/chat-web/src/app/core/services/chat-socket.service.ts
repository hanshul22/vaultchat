import { inject, Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { Message } from '../models/message.model';
import { PresenceStatus } from '../models/auth.model';
import { environment } from '../../../environments/environment';

export interface TypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface ReadUpdatedEvent {
  conversationId: string;
  userId: string;
  messageId: string;
}

@Injectable({ providedIn: 'root' })
export class ChatSocketService implements OnDestroy {
  private readonly authService = inject(AuthService);

  private socket: Socket | null = null;

  // ── Public observables ────────────────────────────────────────────────────

  private readonly _connected$ = new BehaviorSubject<boolean>(false);
  readonly connected$ = this._connected$.asObservable();

  private readonly _message$ = new Subject<Message>();
  readonly message$ = this._message$.asObservable();

  private readonly _typing$ = new Subject<TypingEvent>();
  readonly typing$ = this._typing$.asObservable();

  private readonly _presence$ = new Subject<PresenceStatus[]>();
  readonly presence$ = this._presence$.asObservable();

  private readonly _readUpdated$ = new Subject<ReadUpdatedEvent>();
  readonly readUpdated$ = this._readUpdated$.asObservable();

  // ── Connect / disconnect ──────────────────────────────────────────────────

  connect(): void {
    if (this.socket?.connected) return;

    const token = this.authService.getToken();
    if (!token) return;

    this.socket = io(`${environment.apiOrigin}/chat`, {
      auth: { token },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      this._connected$.next(true);
    });

    this.socket.on('disconnect', () => {
      this._connected$.next(false);
    });

    this.socket.on('chat:message-created', (msg: Message) => {
      this._message$.next(msg);
    });

    this.socket.on('chat:typing', (event: TypingEvent) => {
      this._typing$.next(event);
    });

    this.socket.on('chat:presence-updated', (statuses: PresenceStatus[]) => {
      this._presence$.next(statuses);
    });

    this.socket.on('chat:read-updated', (event: ReadUpdatedEvent) => {
      this._readUpdated$.next(event);
    });

    this.socket.on('chat:error', (err: { message: string }) => {
      console.error('[ChatSocket] error:', err.message);
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this._connected$.next(false);
  }

  // ── Room management ───────────────────────────────────────────────────────

  joinConversation(conversationId: string): void {
    this.socket?.emit('chat:join-conversation', { conversationId });
  }

  leaveConversation(conversationId: string): void {
    this.socket?.emit('chat:leave-conversation', { conversationId });
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  sendMessage(conversationId: string, body: string, mediaIds?: string[]): void {
    this.socket?.emit('chat:send-message', {
      conversationId,
      body,
      ...(mediaIds?.length ? { mediaIds } : {}),
    });
  }

  // ── Typing ────────────────────────────────────────────────────────────────

  typingStart(conversationId: string): void {
    this.socket?.emit('chat:typing-start', { conversationId });
  }

  typingStop(conversationId: string): void {
    this.socket?.emit('chat:typing-stop', { conversationId });
  }

  // ── Read state ────────────────────────────────────────────────────────────

  markRead(conversationId: string, messageId: string): void {
    this.socket?.emit('chat:mark-read', { conversationId, messageId });
  }

  // ── Presence ──────────────────────────────────────────────────────────────

  getPresence(userIds: string[]): void {
    this.socket?.emit('chat:get-presence', { userIds });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.disconnect();
  }
}
