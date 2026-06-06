import { Component, EventEmitter, Input, OnDestroy, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-message-composer',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="composer">
      <textarea
        class="composer__input"
        [(ngModel)]="body"
        (ngModelChange)="onBodyChange()"
        (keydown.enter)="onEnter($event)"
        placeholder="Type a message…"
        rows="1"
        [disabled]="disabled"
      ></textarea>
      <button
        class="composer__send"
        (click)="onSend()"
        [disabled]="disabled || !body.trim()"
        title="Send"
      >
        ➤
      </button>
    </div>
  `,
  styles: [
    `
      .composer {
        display: flex;
        align-items: flex-end;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        background: #fff;
        border-top: 1px solid #e0e0e0;
      }
      .composer__input {
        flex: 1;
        resize: none;
        border: 1px solid #ccc;
        border-radius: 20px;
        padding: 0.55rem 1rem;
        font-size: 0.95rem;
        font-family: inherit;
        outline: none;
        max-height: 120px;
        overflow-y: auto;
        line-height: 1.4;
        transition: border-color 0.2s;
      }
      .composer__input:focus {
        border-color: #1a73e8;
      }
      .composer__send {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #1a73e8;
        color: #fff;
        border: none;
        cursor: pointer;
        font-size: 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: background 0.2s;
      }
      .composer__send:hover:not(:disabled) {
        background: #1558b0;
      }
      .composer__send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
})
export class MessageComposerComponent implements OnDestroy {
  @Input() disabled = false;
  @Output() send = new EventEmitter<string>();
  @Output() typingStart = new EventEmitter<void>();
  @Output() typingStop = new EventEmitter<void>();

  body = '';

  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private isTyping = signal(false);

  onBodyChange(): void {
    if (!this.isTyping()) {
      this.isTyping.set(true);
      this.typingStart.emit();
    }
    // Reset the stop timer on every keystroke.
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => {
      this.isTyping.set(false);
      this.typingStop.emit();
    }, 2000);
  }

  onEnter(event: Event): void {
    const ke = event as KeyboardEvent;
    if (ke.shiftKey) return; // Shift+Enter = newline
    ke.preventDefault();
    this.onSend();
  }

  onSend(): void {
    const trimmed = this.body.trim();
    if (!trimmed) return;
    this.send.emit(trimmed);
    this.body = '';
    // Stop typing indicator immediately on send.
    if (this.typingTimer) clearTimeout(this.typingTimer);
    if (this.isTyping()) {
      this.isTyping.set(false);
      this.typingStop.emit();
    }
  }

  ngOnDestroy(): void {
    if (this.typingTimer) clearTimeout(this.typingTimer);
  }
}
