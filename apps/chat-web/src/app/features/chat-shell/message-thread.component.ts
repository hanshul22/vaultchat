import {
  AfterViewChecked,
  Component,
  ElementRef,
  inject,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Message } from '../../core/models/message.model';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-message-thread',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="thread" #scrollContainer>
      @if (messages.length === 0) {
        <div class="thread__empty">No messages yet. Say hello!</div>
      }

      @for (msg of messages; track msg.id) {
        <div class="msg" [class.msg--mine]="isMine(msg)">
          @if (!isMine(msg)) {
            <div class="msg__sender">{{ msg.sender.fullName }}</div>
          }
          <div class="msg__bubble">
            @if (msg.body) {
              <span class="msg__text">{{ msg.body }}</span>
            }
            @if (msg.media.length > 0) {
              <div class="msg__attachments">
                @for (att of msg.media; track att.id) {
                  @if (att.mimeType.startsWith('image/')) {
                    <img [src]="att.url" [alt]="att.mimeType" class="msg__img" />
                  } @else {
                    <a [href]="att.url" target="_blank" class="msg__file"> 📎 Attachment </a>
                  }
                }
              </div>
            }
          </div>
          <div class="msg__time">{{ msg.createdAt | date: 'shortTime' }}</div>
        </div>
      }

      @if (typingLabel) {
        <div class="typing-indicator">{{ typingLabel }}</div>
      }
    </div>
  `,
  styles: [
    `
      .thread {
        flex: 1;
        overflow-y: auto;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        background: #f8f9fa;
      }
      .thread__empty {
        text-align: center;
        color: #888;
        margin-top: 2rem;
        font-size: 0.9rem;
      }
      .msg {
        display: flex;
        flex-direction: column;
        max-width: 70%;
      }
      .msg--mine {
        align-self: flex-end;
        align-items: flex-end;
      }
      .msg:not(.msg--mine) {
        align-self: flex-start;
        align-items: flex-start;
      }
      .msg__sender {
        font-size: 0.75rem;
        color: #888;
        margin-bottom: 0.2rem;
      }
      .msg__bubble {
        padding: 0.55rem 0.85rem;
        border-radius: 16px;
        font-size: 0.92rem;
        line-height: 1.4;
        word-break: break-word;
      }
      .msg--mine .msg__bubble {
        background: #1a73e8;
        color: #fff;
        border-bottom-right-radius: 4px;
      }
      .msg:not(.msg--mine) .msg__bubble {
        background: #fff;
        color: #222;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      }
      .msg__time {
        font-size: 0.7rem;
        color: #aaa;
        margin-top: 0.2rem;
      }
      .msg__attachments {
        margin-top: 0.4rem;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      .msg__img {
        max-width: 200px;
        border-radius: 8px;
      }
      .msg__file {
        color: #1a73e8;
        font-size: 0.85rem;
      }
      .typing-indicator {
        align-self: flex-start;
        font-size: 0.82rem;
        color: #888;
        font-style: italic;
        padding: 0.3rem 0.5rem;
      }
    `,
  ],
})
export class MessageThreadComponent implements OnChanges, AfterViewChecked {
  private readonly authService = inject(AuthService);

  @Input() messages: Message[] = [];
  @Input() typingLabel: string | null = null;

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef<HTMLDivElement>;

  private shouldScroll = false;

  ngOnChanges(_changes: SimpleChanges): void {
    this.shouldScroll = true;
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  isMine(msg: Message): boolean {
    return msg.sender.id === this.authService.getCurrentUser()?.id;
  }

  private scrollToBottom(): void {
    try {
      const el = this.scrollContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {
      // ignore
    }
  }
}
