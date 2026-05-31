import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnInit,
  Output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Conversation } from '../../core/models/conversation.model';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="conv-list">
      <div class="conv-list__header">
        <span>Conversations</span>
      </div>

      @if (conversations.length === 0) {
        <div class="conv-list__empty">No conversations yet.</div>
      }

      @for (conv of conversations; track conv.id) {
        <button
          class="conv-item"
          [class.conv-item--active]="conv.id === activeId"
          (click)="select.emit(conv)"
        >
          <div class="conv-item__avatar">
            <span class="conv-item__initials">{{ getInitials(conv) }}</span>
            @if (isOnline(conv)) {
              <span class="presence-dot"></span>
            }
          </div>

          <div class="conv-item__body">
            <div class="conv-item__top">
              <span class="conv-item__name">{{ getTitle(conv) }}</span>
              @if (conv.lastMessage) {
                <span class="conv-item__time">
                  {{ conv.lastMessage.createdAt | date: 'shortTime' }}
                </span>
              }
            </div>
            <div class="conv-item__preview">
              {{ conv.lastMessage?.body || 'No messages yet' }}
            </div>
          </div>

          @if (conv.unreadCount > 0) {
            <span class="unread-badge">{{ conv.unreadCount }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: [
    `
      .conv-list {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow-y: auto;
        background: #fff;
        border-right: 1px solid #e0e0e0;
      }
      .conv-list__header {
        padding: 1rem;
        font-weight: 700;
        font-size: 1rem;
        border-bottom: 1px solid #e0e0e0;
        color: #333;
      }
      .conv-list__empty {
        padding: 1.5rem 1rem;
        color: #888;
        font-size: 0.9rem;
        text-align: center;
      }
      .conv-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        border: none;
        background: transparent;
        cursor: pointer;
        text-align: left;
        width: 100%;
        transition: background 0.15s;
        border-bottom: 1px solid #f0f0f0;
      }
      .conv-item:hover {
        background: #f5f5f5;
      }
      .conv-item--active {
        background: #e8f0fe;
      }
      .conv-item__avatar {
        position: relative;
        flex-shrink: 0;
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: #1a73e8;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .conv-item__initials {
        color: #fff;
        font-weight: 700;
        font-size: 0.9rem;
      }
      .presence-dot {
        position: absolute;
        bottom: 1px;
        right: 1px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #34a853;
        border: 2px solid #fff;
      }
      .conv-item__body {
        flex: 1;
        min-width: 0;
      }
      .conv-item__top {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 0.2rem;
      }
      .conv-item__name {
        font-weight: 600;
        font-size: 0.9rem;
        color: #222;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 140px;
      }
      .conv-item__time {
        font-size: 0.75rem;
        color: #888;
        flex-shrink: 0;
      }
      .conv-item__preview {
        font-size: 0.82rem;
        color: #666;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .unread-badge {
        background: #1a73e8;
        color: #fff;
        border-radius: 10px;
        padding: 0.1rem 0.45rem;
        font-size: 0.75rem;
        font-weight: 700;
        flex-shrink: 0;
      }
    `,
  ],
})
export class ConversationListComponent implements OnInit, OnChanges {
  private readonly authService = inject(AuthService);

  @Input() conversations: Conversation[] = [];
  @Input() activeId: string | null = null;
  @Input() presenceMap: Map<string, boolean> = new Map();
  @Output() select = new EventEmitter<Conversation>();

  private currentUserId = signal<string | null>(null);

  ngOnInit(): void {
    this.currentUserId.set(this.authService.getCurrentUser()?.id ?? null);
  }

  ngOnChanges(_changes: SimpleChanges): void {
    // Trigger re-render when inputs change.
  }

  getTitle(conv: Conversation): string {
    if (conv.isGroup) return conv.name ?? 'Group';
    const other = conv.members.find((m) => m.id !== this.currentUserId());
    return other?.fullName ?? other?.email ?? 'Unknown';
  }

  getInitials(conv: Conversation): string {
    const title = this.getTitle(conv);
    return title
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  }

  isOnline(conv: Conversation): boolean {
    const other = conv.members.find((m) => m.id !== this.currentUserId());
    if (!other) return false;
    return this.presenceMap.get(other.id) ?? false;
  }
}
