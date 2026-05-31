import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ChatApiService } from '../../core/services/chat-api.service';
import { ChatSocketService } from '../../core/services/chat-socket.service';
import { Conversation } from '../../core/models/conversation.model';
import { Message } from '../../core/models/message.model';

import { ConversationListComponent } from './conversation-list.component';
import { MessageThreadComponent } from './message-thread.component';
import { MessageComposerComponent } from './message-composer.component';

@Component({
  selector: 'app-chat-shell-page',
  standalone: true,
  imports: [
    RouterModule,
    ConversationListComponent,
    MessageThreadComponent,
    MessageComposerComponent,
  ],
  template: `
    <div class="shell">
      <!-- Sidebar -->
      <aside class="shell__sidebar" [class.shell__sidebar--hidden]="activeConvId() && isMobile()">
        <div class="shell__sidebar-header">
          <span class="shell__app-name">VaultChat</span>
          <button class="shell__logout" (click)="logout()" title="Sign out">⏻</button>
        </div>
        <app-conversation-list
          [conversations]="conversations()"
          [activeId]="activeConvId()"
          [presenceMap]="presenceMap()"
          (selected)="selectConversation($event)"
        />
      </aside>

      <!-- Main panel -->
      <main class="shell__main">
        @if (activeConvId()) {
          <!-- Thread header -->
          <div class="shell__thread-header">
            @if (isMobile()) {
              <button class="shell__back" (click)="clearConversation()">← Back</button>
            }
            <span class="shell__thread-title">{{ activeConvTitle() }}</span>
          </div>

          <!-- Messages -->
          <app-message-thread [messages]="messages()" [typingLabel]="typingLabel()" />

          <!-- Composer -->
          <app-message-composer
            (send)="onSend($event)"
            (typingStart)="onTypingStart()"
            (typingStop)="onTypingStop()"
          />
        } @else {
          <div class="shell__empty-state">
            <div class="shell__empty-icon">💬</div>
            <p>Select a conversation to start chatting</p>
          </div>
        }
      </main>
    </div>
  `,
  styles: [
    `
      .shell {
        display: flex;
        height: 100vh;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .shell__sidebar {
        width: 300px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        border-right: 1px solid #e0e0e0;
        background: #fff;
      }
      .shell__sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.85rem 1rem;
        border-bottom: 1px solid #e0e0e0;
      }
      .shell__app-name {
        font-weight: 700;
        font-size: 1.1rem;
        color: #1a73e8;
      }
      .shell__logout {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 1.1rem;
        color: #888;
        padding: 0.2rem;
      }
      .shell__logout:hover {
        color: #c5221f;
      }
      .shell__main {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: #f8f9fa;
      }
      .shell__thread-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
        background: #fff;
        border-bottom: 1px solid #e0e0e0;
        font-weight: 600;
        font-size: 0.95rem;
      }
      .shell__back {
        background: none;
        border: none;
        cursor: pointer;
        color: #1a73e8;
        font-size: 0.9rem;
        padding: 0;
      }
      .shell__thread-title {
        color: #222;
      }
      .shell__empty-state {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #888;
        gap: 0.75rem;
      }
      .shell__empty-icon {
        font-size: 3rem;
      }

      /* Mobile: stack sidebar and main */
      @media (max-width: 640px) {
        .shell__sidebar {
          width: 100%;
        }
        .shell__sidebar--hidden {
          display: none;
        }
      }
    `,
  ],
})
export class ChatShellPageComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly chatApi = inject(ChatApiService);
  private readonly socket = inject(ChatSocketService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // ── State ─────────────────────────────────────────────────────────────────

  conversations = signal<Conversation[]>([]);
  messages = signal<Message[]>([]);
  activeConvId = signal<string | null>(null);
  presenceMap = signal<Map<string, boolean>>(new Map());
  typingLabel = signal<string | null>(null);
  isMobile = signal(window.innerWidth <= 640);

  private typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private subs = new Subscription();

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.socket.connect();
    this.loadConversations();
    this.subscribeToSocket();

    // Handle route param for direct conversation link.
    this.subs.add(
      this.route.paramMap.subscribe((params) => {
        const id = params.get('conversationId');
        if (id) {
          const conv = this.conversations().find((c) => c.id === id);
          if (conv) this.selectConversation(conv);
        }
      }),
    );

    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    this.socket.disconnect();
    this.subs.unsubscribe();
    window.removeEventListener('resize', this.onResize);
    this.typingTimeouts.forEach((t) => clearTimeout(t));
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  private loadConversations(): void {
    this.chatApi.listConversations().subscribe({
      next: (convs) => {
        this.conversations.set(convs);
        // Seed presence for all visible members.
        const memberIds = [...new Set(convs.flatMap((c) => c.members.map((m) => m.id)))];
        if (memberIds.length) this.socket.getPresence(memberIds);
      },
      error: (err) => console.error('Failed to load conversations', err),
    });
  }

  selectConversation(conv: Conversation): void {
    const prev = this.activeConvId();
    if (prev) this.socket.leaveConversation(prev);

    this.activeConvId.set(conv.id);
    this.messages.set([]);
    this.typingLabel.set(null);

    // Update route without full navigation.
    void this.router.navigate(['/chat', conv.id], { replaceUrl: true });

    this.socket.joinConversation(conv.id);
    this.socket.getPresence(conv.members.map((m) => m.id));

    this.chatApi.listMessages(conv.id).subscribe({
      next: (res) => {
        this.messages.set(res.items);
        // Mark latest message as read.
        const last = res.items.at(-1);
        if (last) this.socket.markRead(conv.id, last.id);
      },
      error: (err) => console.error('Failed to load messages', err),
    });

    // Clear unread badge locally.
    this.conversations.update((list) =>
      list.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c)),
    );
  }

  clearConversation(): void {
    const prev = this.activeConvId();
    if (prev) this.socket.leaveConversation(prev);
    this.activeConvId.set(null);
    void this.router.navigate(['/chat'], { replaceUrl: true });
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  onSend(body: string): void {
    const convId = this.activeConvId();
    if (!convId) return;
    this.socket.sendMessage(convId, body);
  }

  // ── Typing ────────────────────────────────────────────────────────────────

  onTypingStart(): void {
    const convId = this.activeConvId();
    if (convId) this.socket.typingStart(convId);
  }

  onTypingStop(): void {
    const convId = this.activeConvId();
    if (convId) this.socket.typingStop(convId);
  }

  // ── Socket subscriptions ──────────────────────────────────────────────────

  private subscribeToSocket(): void {
    // Incoming messages.
    this.subs.add(
      this.socket.message$.subscribe((msg) => {
        if (msg.conversationId === this.activeConvId()) {
          this.messages.update((list) => [...list, msg]);
          // Auto-mark read when viewing the conversation.
          this.socket.markRead(msg.conversationId, msg.id);
        }
        // Update conversation list preview and order.
        this.conversations.update((list) => {
          const updated = list.map((c) => {
            if (c.id !== msg.conversationId) return c;
            const isActive = c.id === this.activeConvId();
            return {
              ...c,
              lastMessage: {
                id: msg.id,
                body: msg.body,
                senderId: msg.sender.id,
                createdAt: msg.createdAt,
              },
              unreadCount: isActive ? 0 : c.unreadCount + 1,
            };
          });
          // Re-sort by latest message.
          return [...updated].sort((a, b) => {
            const aT = a.lastMessage?.createdAt ?? a.createdAt;
            const bT = b.lastMessage?.createdAt ?? b.createdAt;
            return new Date(bT).getTime() - new Date(aT).getTime();
          });
        });
      }),
    );

    // Typing indicators.
    this.subs.add(
      this.socket.typing$.subscribe((event) => {
        if (event.conversationId !== this.activeConvId()) return;
        const currentUserId = this.authService.getCurrentUser()?.id;
        if (event.userId === currentUserId) return;

        const conv = this.conversations().find((c) => c.id === event.conversationId);
        const member = conv?.members.find((m) => m.id === event.userId);
        const name = member?.fullName ?? 'Someone';

        if (event.isTyping) {
          this.typingLabel.set(`${name} is typing…`);
          // Auto-clear after 4 s in case stop event is missed.
          const existing = this.typingTimeouts.get(event.userId);
          if (existing) clearTimeout(existing);
          this.typingTimeouts.set(
            event.userId,
            setTimeout(() => this.typingLabel.set(null), 4000),
          );
        } else {
          this.typingLabel.set(null);
          const t = this.typingTimeouts.get(event.userId);
          if (t) {
            clearTimeout(t);
            this.typingTimeouts.delete(event.userId);
          }
        }
      }),
    );

    // Presence updates.
    this.subs.add(
      this.socket.presence$.subscribe((statuses) => {
        this.presenceMap.update((map) => {
          const next = new Map(map);
          for (const s of statuses) next.set(s.userId, s.isOnline);
          return next;
        });
      }),
    );

    // Read updates.
    this.subs.add(
      this.socket.readUpdated$.subscribe((event) => {
        // Update unread count for the conversation if it's not the active one.
        if (event.conversationId !== this.activeConvId()) {
          this.conversations.update((list) =>
            list.map((c) => (c.id === event.conversationId ? { ...c, unreadCount: 0 } : c)),
          );
        }
      }),
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  activeConvTitle(): string {
    const conv = this.conversations().find((c) => c.id === this.activeConvId());
    if (!conv) return '';
    if (conv.isGroup) return conv.name ?? 'Group';
    const me = this.authService.getCurrentUser()?.id;
    const other = conv.members.find((m) => m.id !== me);
    return other?.fullName ?? other?.email ?? 'Chat';
  }

  logout(): void {
    this.socket.disconnect();
    this.authService.logout();
  }

  private onResize = (): void => {
    this.isMobile.set(window.innerWidth <= 640);
  };
}
