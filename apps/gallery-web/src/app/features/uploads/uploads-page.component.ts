import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';

import { UploadService } from '../../core/services/upload.service';
import { VideoProcessingService } from '../../core/services/video-processing.service';
import { UploadQueueItem, UploadQueueStatus } from '../../core/models/upload-queue-item.model';
import { PreflightRejectReason } from '../../core/models/media-upload-preflight.model';

// ── MIME allowlist (mirrors backend media.constants.ts exactly) ───────────────
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
] as const;

/** accept= string for the file input — covers all allowed types. */
const FILE_INPUT_ACCEPT = ALLOWED_MIME_TYPES.join(',');

/** 100 MB ceiling (mirrors MAX_UPLOAD_SIZE_BYTES from Phase 7). */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

function isAllowedMime(mime: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function preflightReasonMessage(reason: PreflightRejectReason | undefined): string {
  if (reason === 'VAULT_FULL') {
    return 'Your Vault is full. Delete some files or add another Cloudinary account.';
  }
  if (reason === 'FILE_TOO_LARGE_FOR_ANY_ACCOUNT') {
    return 'This file is larger than the free space on any single Cloudinary account in your Vault.';
  }
  return 'The server rejected this file. Check your Vault capacity.';
}

function uploadErrorMessage(err: HttpErrorResponse, mimeType: string): string {
  const body = err.error as { reason?: string; message?: string } | null;
  switch (err.status) {
    case 413:
      return `File exceeds the server's 100 MB limit.`;
    case 415:
      return `Unsupported media type. The server rejected "${mimeType}".`;
    case 507:
      return preflightReasonMessage(body?.reason as PreflightRejectReason | undefined);
    case 400:
      return body?.message ?? 'Invalid request. Check the file size and type.';
    case 401:
      return 'Session expired. Please refresh the page and sign in again.';
    case 502:
    case 504:
      return 'Upload to Cloudinary failed. Please try again.';
    default:
      return 'Upload failed. Please try again.';
  }
}

/**
 * /uploads — upload queue with preflight validation and direct upload execution.
 *
 * State machine per file:
 *   selected → checking → ready → uploading → uploaded
 *                       ↘ uploadError ↗ (retry)
 *
 * VideoProcessingService is injected and its load state is surfaced in the UI
 * so video files show whether ffmpeg.wasm is available. Real transcoding
 * (H.264 CRF 18, 1080p downscale) is wired in the next step.
 */
@Component({
  selector: 'app-uploads-page',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="uploads-page">
      <!-- ── Header ─────────────────────────────────────────────────────── -->
      <header class="uploads-page__header">
        <h1 class="uploads-page__title">Uploads</h1>
        <p class="uploads-page__subtitle">
          Select images or videos to add to your Vault. Each file is checked against your available
          storage before uploading.
        </p>
      </header>

      <!-- ── Drop zone ──────────────────────────────────────────────────── -->
      <div
        class="drop-zone"
        [class.drop-zone--active]="isDragging()"
        role="button"
        tabindex="0"
        aria-label="Drop files here or click to browse"
        (click)="openFilePicker()"
        (keydown.enter)="openFilePicker()"
        (keydown.space)="openFilePicker()"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave()"
        (drop)="onDrop($event)"
      >
        <span class="drop-zone__icon" aria-hidden="true">📂</span>
        <p class="drop-zone__primary">
          Drop images or videos here, or
          <span class="drop-zone__browse">click to browse</span>
        </p>
        <p class="drop-zone__secondary">
          Supported: JPEG, PNG, WebP, GIF, MP4, QuickTime · Max 100 MB per file
        </p>
      </div>

      <!-- Hidden file input -->
      <input
        #fileInput
        type="file"
        [accept]="fileInputAccept"
        multiple
        class="uploads-page__file-input"
        aria-hidden="true"
        tabindex="-1"
        (change)="onFileInputChange($event)"
      />

      <!-- ── ffmpeg status banner (shown only when video files are queued) ── -->
      @if (hasVideoItems()) {
        <div
          class="ffmpeg-banner"
          [attr.data-state]="ffmpegState()"
          role="status"
          aria-live="polite"
        >
          @switch (ffmpegState()) {
            @case ('idle') {
              <span class="ffmpeg-banner__icon">🎬</span>
              <span>
                Video processing (ffmpeg.wasm) will be loaded when needed. Videos are uploaded
                directly for now.
              </span>
            }
            @case ('loading') {
              <span class="ffmpeg-banner__spinner" aria-hidden="true"></span>
              <span>Loading video processing engine…</span>
            }
            @case ('ready') {
              <span class="ffmpeg-banner__icon">✅</span>
              <span>Video processing engine ready.</span>
            }
            @case ('failed') {
              <span class="ffmpeg-banner__icon">⚠️</span>
              <span>
                Video processing engine unavailable — videos will be uploaded without compression.
              </span>
            }
          }
        </div>
      }

      <!-- ── Queue ───────────────────────────────────────────────────────── -->
      @if (queue().length > 0) {
        <section class="queue" aria-label="Upload queue">
          <!-- Queue header + bulk actions -->
          <div class="queue__header">
            <h2 class="queue__title">
              Queue
              <span class="queue__badge">{{ queue().length }}</span>
            </h2>

            <div class="queue__actions">
              @if (hasPendingItems()) {
                <button
                  type="button"
                  class="btn btn--ghost"
                  [disabled]="isBusy()"
                  (click)="runPreflightAll()"
                >
                  @if (isCheckingAny()) {
                    Checking…
                  } @else {
                    Check all
                  }
                </button>
              }

              @if (hasReadyItems()) {
                <button
                  type="button"
                  class="btn btn--primary"
                  [disabled]="isBusy()"
                  (click)="uploadAll()"
                >
                  @if (isUploadingAny()) {
                    Uploading…
                  } @else {
                    Upload {{ readyCount() }} file{{ readyCount() === 1 ? '' : 's' }}
                  }
                </button>
              }

              <button
                type="button"
                class="btn btn--ghost"
                [disabled]="isBusy()"
                (click)="clearQueue()"
              >
                Clear all
              </button>
            </div>
          </div>

          <!-- File list -->
          <ul class="queue__list" aria-label="Files in queue">
            @for (item of queue(); track item.clientId) {
              <li class="queue-item" [attr.data-status]="item.status">
                <!-- Status icon -->
                <span class="queue-item__icon" aria-hidden="true">
                  @switch (item.status) {
                    @case ('checking') {
                      <span class="queue-item__spinner"></span>
                    }
                    @case ('uploading') {
                      <span class="queue-item__spinner queue-item__spinner--upload"></span>
                    }
                    @case ('ready') {
                      ✅
                    }
                    @case ('uploaded') {
                      🎉
                    }
                    @case ('uploadError') {
                      ❌
                    }
                    @default {
                      {{ mimeIcon(item.mimeType) }}
                    }
                  }
                </span>

                <!-- File info -->
                <div class="queue-item__info">
                  <p class="queue-item__name" [title]="item.filename">
                    {{ item.filename }}
                  </p>
                  <p class="queue-item__meta">
                    {{ formatBytes(item.sizeBytes) }} · {{ item.mimeType }}
                  </p>

                  <!-- Preflight OK -->
                  @if (item.status === 'ready' && item.preflightResult) {
                    <p class="queue-item__status queue-item__status--ok">
                      ✓ Preflight passed — target:
                      {{ item.preflightResult.targetAccountRole }}
                      @if (item.preflightResult.targetSecondaryOrder) {
                        slot {{ item.preflightResult.targetSecondaryOrder }}
                      }
                    </p>
                  }

                  <!-- Uploading -->
                  @if (item.status === 'uploading') {
                    <p class="queue-item__status queue-item__status--info">
                      Uploading to Cloudinary…
                    </p>
                  }

                  <!-- Uploaded success -->
                  @if (item.status === 'uploaded' && item.uploadedMedia) {
                    <p class="queue-item__status queue-item__status--ok">✓ Uploaded successfully</p>
                    <p class="queue-item__status queue-item__status--muted">
                      ID: {{ item.uploadedMedia.id }} ·
                      {{ item.uploadedMedia.createdAt | date: 'dd MMM yyyy, HH:mm' }}
                    </p>
                  }

                  <!-- Error (preflight or upload) -->
                  @if (item.status === 'uploadError' && item.errorMessage) {
                    <p class="queue-item__status queue-item__status--err">
                      {{ item.errorMessage }}
                    </p>
                  }
                </div>

                <!-- Per-item actions -->
                <div class="queue-item__actions">
                  <!-- Check (preflight) -->
                  @if (item.status === 'selected') {
                    <button
                      type="button"
                      class="btn btn--sm btn--ghost"
                      [disabled]="isBusy()"
                      (click)="runPreflightOne(item.clientId)"
                      [attr.aria-label]="'Check ' + item.filename"
                    >
                      Check
                    </button>
                  }

                  <!-- Re-check after error -->
                  @if (item.status === 'uploadError') {
                    <button
                      type="button"
                      class="btn btn--sm btn--ghost"
                      [disabled]="isBusy()"
                      (click)="runPreflightOne(item.clientId)"
                      [attr.aria-label]="'Retry check for ' + item.filename"
                    >
                      Re-check
                    </button>
                  }

                  <!-- Upload single file -->
                  @if (item.status === 'ready') {
                    <button
                      type="button"
                      class="btn btn--sm btn--primary"
                      [disabled]="isBusy()"
                      (click)="uploadOne(item.clientId)"
                      [attr.aria-label]="'Upload ' + item.filename"
                    >
                      Upload
                    </button>
                  }

                  <!-- Remove (not while uploading/checking) -->
                  @if (item.status !== 'uploading' && item.status !== 'checking') {
                    <button
                      type="button"
                      class="btn btn--sm btn--danger-ghost"
                      (click)="removeItem(item.clientId)"
                      [attr.aria-label]="'Remove ' + item.filename"
                    >
                      Remove
                    </button>
                  }
                </div>
              </li>
            }
          </ul>

          <!-- ── Summary notices ─────────────────────────────────────────── -->
          @if (uploadedCount() > 0) {
            <div class="queue__notice queue__notice--success" role="status">
              🎉
              <strong
                >{{ uploadedCount() }} file{{ uploadedCount() === 1 ? '' : 's' }} uploaded</strong
              >
              to your Vault. Visit the
              <a routerLink="/gallery" class="queue__notice-link">Gallery</a>
              to see them.
            </div>
          }

          @if (hasReadyItems() && !isUploadingAny()) {
            <div class="queue__notice" role="note">
              <strong
                >{{ readyCount() }} file{{ readyCount() === 1 ? '' : 's' }} ready for direct
                upload.</strong
              >
              Optional ffmpeg.wasm compression for videos will be added in the next phase — files
              are uploaded as-is for now.
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [
    `
      /* ── Page ─────────────────────────────────────────────────────────── */
      .uploads-page {
        max-width: 720px;
      }

      .uploads-page__header {
        margin-bottom: 1.5rem;
      }

      .uploads-page__title {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0 0 0.375rem;
      }

      .uploads-page__subtitle {
        font-size: 0.9rem;
        color: #6b7280;
        margin: 0;
      }

      .uploads-page__file-input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }

      /* ── Drop zone ────────────────────────────────────────────────────── */
      .drop-zone {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 2.5rem 1.5rem;
        border: 2px dashed #d1d5db;
        border-radius: 12px;
        background: #f9fafb;
        cursor: pointer;
        transition:
          border-color 150ms,
          background 150ms;
        text-align: center;
        margin-bottom: 1.5rem;
        user-select: none;
      }

      .drop-zone:hover,
      .drop-zone:focus-visible {
        border-color: #6366f1;
        background: #eef2ff;
        outline: none;
      }

      .drop-zone--active {
        border-color: #6366f1;
        background: #eef2ff;
      }

      .drop-zone__icon {
        font-size: 2.5rem;
        line-height: 1;
      }

      .drop-zone__primary {
        font-size: 0.95rem;
        color: #374151;
        margin: 0;
      }

      .drop-zone__browse {
        color: #6366f1;
        font-weight: 500;
        text-decoration: underline;
      }

      .drop-zone__secondary {
        font-size: 0.8rem;
        color: #9ca3af;
        margin: 0;
      }

      /* ── Queue ────────────────────────────────────────────────────────── */
      .queue {
        margin-top: 0.5rem;
      }

      .queue__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.75rem;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .queue__title {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .queue__badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.5rem;
        height: 1.5rem;
        padding: 0 0.4rem;
        border-radius: 999px;
        background: #e0e7ff;
        color: #4338ca;
        font-size: 0.75rem;
        font-weight: 700;
      }

      .queue__actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }

      .queue__list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }

      /* ── Queue item ───────────────────────────────────────────────────── */
      .queue-item {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.75rem 0.875rem;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        background: #fff;
        transition: border-color 150ms;
      }

      .queue-item[data-status='ready'] {
        border-color: #bbf7d0;
        background: #f0fdf4;
      }
      .queue-item[data-status='uploading'] {
        border-color: #bfdbfe;
        background: #eff6ff;
      }
      .queue-item[data-status='uploaded'] {
        border-color: #6ee7b7;
        background: #ecfdf5;
      }
      .queue-item[data-status='uploadError'] {
        border-color: #fecaca;
        background: #fef2f2;
      }
      .queue-item[data-status='checking'] {
        border-color: #e0e7ff;
        background: #f5f3ff;
      }

      .queue-item__icon {
        font-size: 1.25rem;
        flex-shrink: 0;
        line-height: 1.4;
        min-width: 1.5rem;
        text-align: center;
      }

      .queue-item__spinner {
        display: inline-block;
        width: 18px;
        height: 18px;
        border: 2px solid #e0e7ff;
        border-top-color: #6366f1;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        vertical-align: middle;
      }

      .queue-item__spinner--upload {
        border-color: #bfdbfe;
        border-top-color: #2563eb;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .queue-item__info {
        flex: 1;
        min-width: 0;
      }

      .queue-item__name {
        font-size: 0.875rem;
        font-weight: 500;
        color: #111827;
        margin: 0 0 0.15rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .queue-item__meta {
        font-size: 0.75rem;
        color: #6b7280;
        margin: 0 0 0.2rem;
      }

      .queue-item__status {
        font-size: 0.75rem;
        margin: 0 0 0.1rem;
      }
      .queue-item__status--ok {
        color: #15803d;
      }
      .queue-item__status--err {
        color: #b91c1c;
      }
      .queue-item__status--info {
        color: #1d4ed8;
      }
      .queue-item__status--muted {
        color: #9ca3af;
        font-size: 0.7rem;
      }

      .queue-item__actions {
        display: flex;
        gap: 0.375rem;
        flex-shrink: 0;
        align-items: flex-start;
      }

      /* ── Buttons ──────────────────────────────────────────────────────── */
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.4rem 0.875rem;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        border: 1px solid transparent;
        transition:
          background 150ms,
          color 150ms,
          border-color 150ms;
        white-space: nowrap;
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .btn--primary {
        background: #6366f1;
        color: #fff;
        border-color: #6366f1;
      }
      .btn--primary:not(:disabled):hover {
        background: #4f46e5;
        border-color: #4f46e5;
      }

      .btn--ghost {
        background: transparent;
        color: #374151;
        border-color: #d1d5db;
      }
      .btn--ghost:not(:disabled):hover {
        background: #f3f4f6;
      }

      .btn--sm {
        padding: 0.25rem 0.625rem;
        font-size: 0.8rem;
      }

      .btn--danger-ghost {
        background: transparent;
        color: #b91c1c;
        border-color: #fca5a5;
      }
      .btn--danger-ghost:not(:disabled):hover {
        background: #fef2f2;
      }

      /* ── Notices ──────────────────────────────────────────────────────── */
      .queue__notice {
        margin-top: 1rem;
        padding: 0.875rem 1rem;
        border-radius: 8px;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        font-size: 0.85rem;
        color: #1e40af;
        line-height: 1.5;
      }

      .queue__notice--success {
        background: #f0fdf4;
        border-color: #86efac;
        color: #15803d;
      }

      .queue__notice-link {
        color: inherit;
        font-weight: 600;
        text-decoration: underline;
      }

      /* ── ffmpeg status banner ─────────────────────────────────────────── */
      .ffmpeg-banner {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        padding: 0.625rem 0.875rem;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        background: #f9fafb;
        font-size: 0.8rem;
        color: #6b7280;
        margin-bottom: 1rem;
        line-height: 1.4;
      }

      .ffmpeg-banner[data-state='ready'] {
        background: #f0fdf4;
        border-color: #bbf7d0;
        color: #15803d;
      }

      .ffmpeg-banner[data-state='loading'] {
        background: #f5f3ff;
        border-color: #e0e7ff;
        color: #4338ca;
      }

      .ffmpeg-banner[data-state='failed'] {
        background: #fffbeb;
        border-color: #fde68a;
        color: #92400e;
      }

      .ffmpeg-banner__icon {
        font-size: 1rem;
        flex-shrink: 0;
      }

      .ffmpeg-banner__spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid #e0e7ff;
        border-top-color: #6366f1;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        flex-shrink: 0;
      }
    `,
  ],
})
export class UploadsPageComponent {
  @ViewChild('fileInput') private fileInputRef!: ElementRef<HTMLInputElement>;

  private readonly uploadService = inject(UploadService);
  private readonly videoProcessing = inject(VideoProcessingService);

  readonly fileInputAccept = FILE_INPUT_ACCEPT;
  readonly queue = signal<UploadQueueItem[]>([]);
  readonly isDragging = signal(false);

  /**
   * Reactive snapshot of the ffmpeg engine load state.
   * Drives the ffmpeg status banner shown when video files are in the queue.
   */
  readonly ffmpegState = toSignal(this.videoProcessing.loadState$, {
    initialValue: this.videoProcessing.loadState,
  });

  // ── Computed helpers ────────────────────────────────────────────────────

  isCheckingAny(): boolean {
    return this.queue().some((i) => i.status === 'checking');
  }

  isUploadingAny(): boolean {
    return this.queue().some((i) => i.status === 'uploading');
  }

  /** True when any async operation is in flight — disables bulk actions. */
  isBusy(): boolean {
    return this.isCheckingAny() || this.isUploadingAny();
  }

  hasPendingItems(): boolean {
    return this.queue().some((i) => i.status === 'selected' || i.status === 'uploadError');
  }

  hasReadyItems(): boolean {
    return this.queue().some((i) => i.status === 'ready');
  }

  readyCount(): number {
    return this.queue().filter((i) => i.status === 'ready').length;
  }

  uploadedCount(): number {
    return this.queue().filter((i) => i.status === 'uploaded').length;
  }

  /** True when at least one video file is in the queue (any status). */
  hasVideoItems(): boolean {
    return this.queue().some((i) => i.mimeType.startsWith('video/'));
  }

  // ── File selection ──────────────────────────────────────────────────────

  openFilePicker(): void {
    this.fileInputRef.nativeElement.click();
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(Array.from(input.files));
      input.value = '';
    }
  }

  // ── Drag and drop ───────────────────────────────────────────────────────

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(): void {
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    const files = event.dataTransfer?.files;
    if (files) this.addFiles(Array.from(files));
  }

  // ── Queue management ────────────────────────────────────────────────────

  private addFiles(files: File[]): void {
    const newItems: UploadQueueItem[] = files.map((file) => {
      if (!isAllowedMime(file.type)) {
        return this.makeItem(
          file,
          'uploadError',
          `Unsupported type "${file.type}". Allowed: JPEG, PNG, WebP, GIF, MP4, QuickTime.`,
        );
      }
      if (file.size > MAX_FILE_BYTES) {
        return this.makeItem(
          file,
          'uploadError',
          `File exceeds the 100 MB limit (${formatBytes(file.size)}).`,
        );
      }
      return this.makeItem(file, 'selected');
    });

    this.queue.update((q) => [...q, ...newItems]);

    // Trigger lazy-load of ffmpeg.wasm as soon as the first video file
    // enters the queue, so the engine is ready by the time the user clicks
    // Upload. load() is idempotent — safe to call on every add.
    const hasVideo = newItems.some((i) => i.mimeType.startsWith('video/'));
    if (hasVideo && this.videoProcessing.loadState === 'idle') {
      void this.videoProcessing.load();
    }
  }

  removeItem(clientId: string): void {
    this.queue.update((q) => q.filter((i) => i.clientId !== clientId));
  }

  clearQueue(): void {
    this.queue.set([]);
  }

  // ── Preflight ───────────────────────────────────────────────────────────

  runPreflightAll(): void {
    const pending = this.queue().filter(
      (i) => i.status === 'selected' || i.status === 'uploadError',
    );
    for (const item of pending) {
      this.runPreflightOne(item.clientId);
    }
  }

  runPreflightOne(clientId: string): void {
    const item = this.queue().find((i) => i.clientId === clientId);
    if (!item || item.status === 'checking' || item.status === 'uploading') return;

    this.patchItem(clientId, {
      status: 'checking',
      errorMessage: undefined,
      preflightResult: undefined,
      uploadedMedia: undefined,
    });

    this.uploadService.checkPreflight(item.sizeBytes, item.mimeType).subscribe({
      next: (result) => {
        if (result.canUpload) {
          this.patchItem(clientId, { status: 'ready', preflightResult: result });
        } else {
          this.patchItem(clientId, {
            status: 'uploadError',
            errorMessage: preflightReasonMessage(result.reason),
          });
        }
      },
      error: (err: HttpErrorResponse) => {
        const body = err.error as { reason?: string; message?: string } | null;
        let message: string;
        if (err.status === 415) {
          message = `Unsupported media type. The server rejected "${item.mimeType}".`;
        } else if (err.status === 507) {
          message = preflightReasonMessage(body?.reason as PreflightRejectReason | undefined);
        } else if (err.status === 400) {
          message = body?.message ?? 'Invalid request. Check the file size and type.';
        } else if (err.status === 401) {
          message = 'Session expired. Please refresh the page and sign in again.';
        } else {
          message = 'Could not reach the server. Please try again.';
        }
        this.patchItem(clientId, { status: 'uploadError', errorMessage: message });
      },
    });
  }

  // ── Upload ──────────────────────────────────────────────────────────────

  uploadAll(): void {
    const ready = this.queue().filter((i) => i.status === 'ready');
    for (const item of ready) {
      this.uploadOne(item.clientId);
    }
  }

  uploadOne(clientId: string): void {
    const item = this.queue().find((i) => i.clientId === clientId);
    if (!item || item.status !== 'ready') return;

    this.patchItem(clientId, { status: 'uploading', errorMessage: undefined });

    this.uploadService.uploadFile(item.file).subscribe({
      next: (response) => {
        this.patchItem(clientId, { status: 'uploaded', uploadedMedia: response });
      },
      error: (err: HttpErrorResponse) => {
        this.patchItem(clientId, {
          status: 'uploadError',
          errorMessage: uploadErrorMessage(err, item.mimeType),
        });
      },
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private makeItem(file: File, status: UploadQueueStatus, errorMessage?: string): UploadQueueItem {
    return {
      clientId: crypto.randomUUID(),
      filename: file.name,
      sizeBytes: file.size,
      mimeType: file.type,
      status,
      errorMessage,
      file,
    };
  }

  private patchItem(
    clientId: string,
    patch: Partial<
      Omit<UploadQueueItem, 'clientId' | 'file' | 'filename' | 'sizeBytes' | 'mimeType'>
    >,
  ): void {
    this.queue.update((q) => q.map((i) => (i.clientId === clientId ? { ...i, ...patch } : i)));
  }

  mimeIcon(mimeType: string): string {
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('image/')) return '🖼';
    return '📄';
  }

  readonly formatBytes = formatBytes;
}
