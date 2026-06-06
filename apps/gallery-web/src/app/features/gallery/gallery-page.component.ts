import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  computed,
  ViewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';

import { MediaService } from '../../core/services/media.service';
import { VideoPlaybackService } from '../../core/services/video-playback.service';
import { MediaItem, mediaFamily } from '../../core/models/media-item.model';
import { PaginationMeta } from '../../core/models/paginated-media-response.model';

/** View-model enriched with the derived thumbnail URL. */
interface MediaCard extends MediaItem {
  thumbnailUrl: string;
}

type LoadState = 'loading' | 'loaded' | 'error';

/** Per-item delete outcome tracked during a bulk delete run. */
interface DeleteFailure {
  id: string;
  mimeType: string;
}

/**
 * /gallery — real API-backed media grid with bulk select and bulk delete.
 *
 * Fetches page 1 of the authenticated user's media on init, renders a
 * responsive thumbnail grid, and supports:
 *  - Selection mode toggled via a toolbar button or keyboard (Enter/Space)
 *  - Individual card selection via checkbox or keyboard
 *  - Bulk delete with a confirmation dialog before any destructive action
 *  - Sequential delete execution reusing the existing DELETE /media/:id endpoint
 *  - Per-item failure reporting without silently swallowing errors
 */
@Component({
  selector: 'app-gallery-page',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gallery-page">
      <header class="gallery-page__header">
        <h1 class="gallery-page__title">Gallery</h1>
        @if (loadState() === 'loaded') {
          <span class="gallery-page__count">
            {{ meta()?.total ?? 0 }} item{{ (meta()?.total ?? 0) === 1 ? '' : 's' }}
          </span>
        }

        @if (loadState() === 'loaded' && items().length > 0) {
          @if (!selectionMode()) {
            <button
              type="button"
              class="gallery-page__select-btn"
              (click)="enterSelectionMode()"
              aria-label="Enter selection mode"
            >
              Select
            </button>
          } @else {
            <button
              type="button"
              class="gallery-page__select-btn gallery-page__select-btn--cancel"
              (click)="exitSelectionMode()"
              aria-label="Exit selection mode and clear selection"
            >
              Cancel
            </button>
          }
        }
      </header>

      @if (selectionMode()) {
        <div class="gallery-page__action-bar" role="toolbar" aria-label="Bulk actions">
          <span class="gallery-page__selection-count" aria-live="polite" aria-atomic="true">
            {{ selectedCount() }} selected
          </span>

          <button
            type="button"
            class="gallery-page__select-all-btn"
            (click)="toggleSelectAll()"
            [attr.aria-pressed]="allSelected()"
          >
            {{ allSelected() ? 'Deselect all' : 'Select all' }}
          </button>

          <button
            type="button"
            class="gallery-page__delete-btn"
            [disabled]="selectedCount() === 0 || isDeleting()"
            (click)="requestBulkDelete()"
            aria-label="Delete selected items"
          >
            @if (isDeleting()) {
              Deleting…
            } @else {
              Delete {{ selectedCount() > 0 ? '(' + selectedCount() + ')' : '' }}
            }
          </button>
        </div>
      }

      @if (deleteFailures().length > 0) {
        <div class="gallery-page__failure-banner" role="alert">
          <strong>
            {{ deleteFailures().length }} item{{ deleteFailures().length === 1 ? '' : 's' }} could
            not be deleted.
          </strong>
          They remain in your gallery. Please try again or contact support if the problem persists.
          <button
            type="button"
            class="gallery-page__failure-dismiss"
            aria-label="Dismiss error"
            (click)="dismissFailures()"
          >
            Dismiss
          </button>
        </div>
      }

      @if (loadState() === 'loading') {
        <div class="gallery-page__loading" role="status" aria-live="polite">
          <span class="gallery-page__spinner" aria-hidden="true"></span>
          <span>Loading your media…</span>
        </div>
      }

      @if (loadState() === 'error') {
        <div class="gallery-page__error" role="alert">
          <p>Could not load your media. Please try again.</p>
          <button type="button" class="gallery-page__retry" (click)="load()">Retry</button>
        </div>
      }

      @if (loadState() === 'loaded' && items().length === 0) {
        <div class="gallery-page__empty">
          <p class="gallery-page__empty-title">No media yet</p>
          <p class="gallery-page__empty-hint">
            Upload your first image or video using the Uploads tab.
          </p>
        </div>
      }

      @if (loadState() === 'loaded' && items().length > 0) {
        <ul class="gallery-grid" aria-label="Media items" aria-multiselectable="true">
          @for (item of items(); track item.id) {
            <li
              class="gallery-card"
              [class.gallery-card--selected]="isSelected(item.id)"
              [class.gallery-card--deleting]="isDeletingItem(item.id)"
              [attr.aria-selected]="selectionMode() ? isSelected(item.id) : null"
            >
              @if (selectionMode()) {
                <label
                  class="gallery-card__select-label"
                  [attr.aria-label]="
                    'Select ' +
                    item.mimeType +
                    ' uploaded ' +
                    (item.createdAt | date: 'dd MMM yyyy')
                  "
                >
                  <input
                    type="checkbox"
                    class="gallery-card__checkbox"
                    [checked]="isSelected(item.id)"
                    [disabled]="isDeletingItem(item.id)"
                    (change)="toggleItem(item.id)"
                    (click)="$event.stopPropagation()"
                  />
                </label>
              }

              <div
                class="gallery-card__thumb-wrap"
                [class.gallery-card__thumb-wrap--video]="
                  family(item) === 'video' && !selectionMode()
                "
                [class.gallery-card__thumb-wrap--selectable]="selectionMode()"
                [attr.role]="
                  selectionMode() ? 'checkbox' : family(item) === 'video' ? 'button' : null
                "
                [attr.tabindex]="selectionMode() || family(item) === 'video' ? '0' : null"
                [attr.aria-checked]="selectionMode() ? isSelected(item.id) : null"
                [attr.aria-label]="
                  selectionMode() ? 'Select ' + item.mimeType : videoAriaLabel(item)
                "
                (click)="onCardClick(item)"
                (keydown.enter)="onCardClick(item)"
                (keydown.space)="$event.preventDefault(); onCardClick(item)"
              >
                <img
                  class="gallery-card__thumb"
                  [src]="item.thumbnailUrl"
                  [alt]="item.mimeType"
                  loading="lazy"
                  decoding="async"
                  width="400"
                  height="400"
                />

                @if (isDeletingItem(item.id)) {
                  <div class="gallery-card__deleting-overlay" aria-hidden="true">
                    <span class="gallery-card__deleting-spinner"></span>
                  </div>
                }

                @if (family(item) === 'video' && !selectionMode()) {
                  <span class="gallery-card__play" aria-hidden="true">▶</span>
                }

                <span
                  class="gallery-card__badge"
                  [class.gallery-card__badge--video]="family(item) === 'video'"
                >
                  {{ family(item) === 'video' ? 'VIDEO' : 'IMAGE' }}
                </span>
              </div>

              <div class="gallery-card__meta">
                <span class="gallery-card__mime" title="{{ item.mimeType }}">
                  {{ item.mimeType }}
                </span>
                <time class="gallery-card__date" [dateTime]="item.createdAt">
                  {{ item.createdAt | date: 'dd MMM yyyy' }}
                </time>
                @if (item.durationSeconds) {
                  <span class="gallery-card__duration">
                    {{ formatDuration(item.durationSeconds) }}
                  </span>
                }
              </div>
            </li>
          }
        </ul>

        @if (hasMorePages()) {
          <p class="gallery-page__pagination-hint">
            Showing page {{ meta()?.page }} of {{ meta()?.totalPages }} ({{ meta()?.total }} items
            total). Full pagination will be added in the next phase.
          </p>
        }
      }
    </div>

    @if (showConfirmDialog()) {
      <div
        class="confirm-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        (click)="cancelBulkDelete()"
        (keydown.escape)="cancelBulkDelete()"
      >
        <div
          class="confirm-dialog"
          tabindex="-1"
          (click)="$event.stopPropagation()"
          (keydown)="$event.stopPropagation()"
        >
          <h2 id="confirm-title" class="confirm-dialog__title">
            Delete {{ selectedCount() }} item{{ selectedCount() === 1 ? '' : 's' }}?
          </h2>
          <p id="confirm-desc" class="confirm-dialog__body">
            This will permanently remove the selected media from your Vault. This action cannot be
            undone.
          </p>
          <div class="confirm-dialog__actions">
            <button
              type="button"
              class="confirm-dialog__cancel"
              (click)="cancelBulkDelete()"
              #cancelBtn
            >
              Cancel
            </button>
            <button type="button" class="confirm-dialog__confirm" (click)="confirmBulkDelete()">
              Delete
            </button>
          </div>
        </div>
      </div>
    }

    @if (activeVideo()) {
      <div
        class="video-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Video player"
        (click)="closePlayer()"
        (keydown.escape)="closePlayer()"
      >
        <div class="video-overlay__inner">
          <button
            type="button"
            class="video-overlay__close"
            aria-label="Close video player"
            (click)="closePlayer()"
          >
            ✕
          </button>

          <video
            #videoEl
            class="video-overlay__player"
            controls
            autoplay
            playsinline
            [attr.aria-label]="activeVideo()?.mimeType"
          ></video>

          @if (playbackError()) {
            <p class="video-overlay__error" role="alert">
              ⚠ Could not play this video. Try downloading it directly.
            </p>
          }

          <p class="video-overlay__meta">
            {{ activeVideo()?.mimeType }} ·
            {{ formatDuration(activeVideoDuration()) }}
          </p>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .gallery-page {
        max-width: 1200px;
      }

      .gallery-page__header {
        display: flex;
        align-items: baseline;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
      }

      .gallery-page__title {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0;
      }

      .gallery-page__count {
        font-size: 0.875rem;
        color: #6b7280;
        margin-right: auto;
      }

      .gallery-page__select-btn {
        padding: 0.375rem 0.875rem;
        border-radius: 6px;
        border: 1px solid #d1d5db;
        background: #fff;
        color: #374151;
        font-size: 0.875rem;
        cursor: pointer;
        transition:
          background 150ms,
          border-color 150ms;
      }

      .gallery-page__select-btn:hover {
        background: #f3f4f6;
        border-color: #9ca3af;
      }

      .gallery-page__select-btn--cancel {
        border-color: #6366f1;
        color: #6366f1;
      }

      .gallery-page__select-btn--cancel:hover {
        background: #eef2ff;
      }

      .gallery-page__action-bar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.625rem 1rem;
        margin-bottom: 1rem;
        background: #f0f4ff;
        border: 1px solid #c7d2fe;
        border-radius: 8px;
        flex-wrap: wrap;
      }

      .gallery-page__selection-count {
        font-size: 0.875rem;
        font-weight: 500;
        color: #374151;
        min-width: 6rem;
      }

      .gallery-page__select-all-btn {
        padding: 0.3rem 0.75rem;
        border-radius: 6px;
        border: 1px solid #a5b4fc;
        background: #fff;
        color: #4f46e5;
        font-size: 0.8rem;
        cursor: pointer;
        transition: background 150ms;
      }

      .gallery-page__select-all-btn:hover {
        background: #eef2ff;
      }

      .gallery-page__delete-btn {
        margin-left: auto;
        padding: 0.375rem 1rem;
        border-radius: 6px;
        border: none;
        background: #ef4444;
        color: #fff;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition:
          background 150ms,
          opacity 150ms;
      }

      .gallery-page__delete-btn:hover:not(:disabled) {
        background: #dc2626;
      }

      .gallery-page__delete-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .gallery-page__failure-banner {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        margin-bottom: 1rem;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 8px;
        color: #991b1b;
        font-size: 0.875rem;
        flex-wrap: wrap;
      }

      .gallery-page__failure-dismiss {
        margin-left: auto;
        padding: 0.25rem 0.625rem;
        border-radius: 5px;
        border: 1px solid #fca5a5;
        background: #fff;
        color: #991b1b;
        font-size: 0.8rem;
        cursor: pointer;
      }

      .gallery-page__failure-dismiss:hover {
        background: #fef2f2;
      }

      .gallery-page__loading {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: #6b7280;
        padding: 3rem 0;
      }

      .gallery-page__spinner {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 2px solid #e5e7eb;
        border-top-color: #6366f1;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .gallery-page__error {
        padding: 2rem;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 8px;
        color: #991b1b;
      }

      .gallery-page__retry {
        margin-top: 0.75rem;
        padding: 0.375rem 1rem;
        border-radius: 6px;
        border: 1px solid #fca5a5;
        background: #fff;
        color: #991b1b;
        cursor: pointer;
        font-size: 0.875rem;
      }

      .gallery-page__retry:hover {
        background: #fef2f2;
      }

      .gallery-page__empty {
        padding: 4rem 2rem;
        text-align: center;
        color: #6b7280;
      }

      .gallery-page__empty-title {
        font-size: 1.125rem;
        font-weight: 500;
        color: #374151;
        margin: 0 0 0.5rem;
      }

      .gallery-page__empty-hint {
        margin: 0;
        font-size: 0.9rem;
      }

      .gallery-grid {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 1rem;
      }

      .gallery-card {
        position: relative;
        border-radius: 8px;
        overflow: hidden;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        transition:
          box-shadow 150ms,
          transform 150ms,
          border-color 150ms;
      }

      .gallery-card:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
      }

      .gallery-card--selected {
        border-color: #6366f1;
        box-shadow: 0 0 0 2px #a5b4fc;
      }

      .gallery-card--deleting {
        opacity: 0.5;
        pointer-events: none;
      }

      .gallery-card__select-label {
        position: absolute;
        top: 6px;
        left: 6px;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: rgba(255, 255, 255, 0.9);
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      }

      .gallery-card__checkbox {
        width: 16px;
        height: 16px;
        cursor: pointer;
        accent-color: #6366f1;
      }

      .gallery-card__thumb-wrap {
        position: relative;
        aspect-ratio: 1;
        overflow: hidden;
        background: #e5e7eb;
      }

      .gallery-card__thumb {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .gallery-card__thumb-wrap--selectable {
        cursor: pointer;
      }

      .gallery-card__thumb-wrap--selectable:focus-visible {
        outline: 2px solid #6366f1;
        outline-offset: 2px;
      }

      .gallery-card__deleting-overlay {
        position: absolute;
        inset: 0;
        background: rgba(255, 255, 255, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .gallery-card__deleting-spinner {
        display: inline-block;
        width: 28px;
        height: 28px;
        border: 3px solid #e5e7eb;
        border-top-color: #6366f1;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }

      .gallery-card__play {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
        color: rgba(255, 255, 255, 0.9);
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
        pointer-events: none;
      }

      .gallery-card__badge {
        position: absolute;
        top: 6px;
        right: 6px;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        background: rgba(99, 102, 241, 0.85);
        color: #fff;
        backdrop-filter: blur(2px);
      }

      .gallery-card__badge--video {
        background: rgba(239, 68, 68, 0.85);
      }

      .gallery-card__meta {
        padding: 0.5rem 0.625rem;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }

      .gallery-card__mime {
        font-size: 0.7rem;
        color: #6b7280;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .gallery-card__date {
        font-size: 0.75rem;
        color: #374151;
      }

      .gallery-card__duration {
        font-size: 0.7rem;
        color: #6b7280;
      }

      .gallery-page__pagination-hint {
        margin-top: 1.5rem;
        font-size: 0.8rem;
        color: #9ca3af;
        text-align: center;
      }

      .gallery-card__thumb-wrap--video {
        cursor: pointer;
      }

      .gallery-card__thumb-wrap--video:focus-visible {
        outline: 2px solid #6366f1;
        outline-offset: 2px;
      }

      .confirm-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1100;
        padding: 1rem;
      }

      .confirm-dialog {
        background: #fff;
        border-radius: 12px;
        padding: 1.75rem;
        max-width: 420px;
        width: 100%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
      }

      .confirm-dialog__title {
        font-size: 1.125rem;
        font-weight: 600;
        color: #111827;
        margin: 0 0 0.75rem;
      }

      .confirm-dialog__body {
        font-size: 0.9rem;
        color: #6b7280;
        margin: 0 0 1.5rem;
        line-height: 1.5;
      }

      .confirm-dialog__actions {
        display: flex;
        gap: 0.75rem;
        justify-content: flex-end;
      }

      .confirm-dialog__cancel {
        padding: 0.5rem 1.25rem;
        border-radius: 7px;
        border: 1px solid #d1d5db;
        background: #fff;
        color: #374151;
        font-size: 0.9rem;
        cursor: pointer;
        transition: background 150ms;
      }

      .confirm-dialog__cancel:hover {
        background: #f3f4f6;
      }

      .confirm-dialog__confirm {
        padding: 0.5rem 1.25rem;
        border-radius: 7px;
        border: none;
        background: #ef4444;
        color: #fff;
        font-size: 0.9rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 150ms;
      }

      .confirm-dialog__confirm:hover {
        background: #dc2626;
      }

      .video-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 1rem;
      }

      .video-overlay__inner {
        position: relative;
        width: 100%;
        max-width: 900px;
        background: #000;
        border-radius: 8px;
        overflow: hidden;
      }

      .video-overlay__close {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        z-index: 10;
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
        border: none;
        background: rgba(0, 0, 0, 0.6);
        color: #fff;
        font-size: 1rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 150ms;
      }

      .video-overlay__close:hover {
        background: rgba(0, 0, 0, 0.9);
      }

      .video-overlay__player {
        width: 100%;
        max-height: 80vh;
        display: block;
        background: #000;
      }

      .video-overlay__error {
        padding: 0.75rem 1rem;
        background: #fef2f2;
        color: #991b1b;
        font-size: 0.875rem;
        margin: 0;
      }

      .video-overlay__meta {
        padding: 0.5rem 1rem;
        font-size: 0.75rem;
        color: #9ca3af;
        background: #111;
        margin: 0;
      }
    `,
  ],
})
export class GalleryPageComponent implements OnInit, OnDestroy {
  @ViewChild('videoEl') private videoElRef?: ElementRef<HTMLVideoElement>;

  private readonly mediaService = inject(MediaService);
  private readonly playback = inject(VideoPlaybackService);

  readonly loadState = signal<LoadState>('loading');
  readonly items = signal<MediaCard[]>([]);
  readonly meta = signal<PaginationMeta | null>(null);

  readonly activeVideo = signal<MediaCard | null>(null);
  readonly playbackError = signal(false);

  readonly selectionMode = signal(false);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly allSelected = computed(
    () => this.items().length > 0 && this.selectedIds().size === this.items().length,
  );

  readonly showConfirmDialog = signal(false);
  readonly deletingIds = signal<Set<string>>(new Set());
  readonly isDeleting = signal(false);
  readonly deleteFailures = signal<DeleteFailure[]>([]);

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.playback.detach();
  }

  load(): void {
    this.loadState.set('loading');
    this.exitSelectionMode();

    this.mediaService.getMedia({ page: 1 }).subscribe({
      next: (response) => {
        this.items.set(response.data as MediaCard[]);
        this.meta.set(response.meta);
        this.loadState.set('loaded');
      },
      error: () => {
        this.loadState.set('error');
      },
    });
  }

  enterSelectionMode(): void {
    this.selectionMode.set(true);
    this.selectedIds.set(new Set());
    this.deleteFailures.set([]);
  }

  exitSelectionMode(): void {
    this.selectionMode.set(false);
    this.selectedIds.set(new Set());
    this.showConfirmDialog.set(false);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  isDeletingItem(id: string): boolean {
    return this.deletingIds().has(id);
  }

  toggleItem(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedIds.set(next);
  }

  toggleSelectAll(): void {
    if (this.allSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(this.items().map((i) => i.id)));
    }
  }

  onCardClick(item: MediaCard): void {
    if (this.selectionMode()) {
      this.toggleItem(item.id);
      return;
    }
    if (this.family(item) === 'video') {
      this.openPlayer(item);
    }
  }

  requestBulkDelete(): void {
    if (this.selectedCount() === 0 || this.isDeleting()) return;
    this.showConfirmDialog.set(true);
  }

  cancelBulkDelete(): void {
    this.showConfirmDialog.set(false);
  }

  confirmBulkDelete(): void {
    this.showConfirmDialog.set(false);
    this.isDeleting.set(true);
    this.deleteFailures.set([]);

    const ids = Array.from(this.selectedIds());
    this.runSequentialDeletes(ids, 0, []);
  }

  private runSequentialDeletes(ids: string[], index: number, failures: DeleteFailure[]): void {
    if (index >= ids.length) {
      this.isDeleting.set(false);
      this.deletingIds.set(new Set());

      if (failures.length > 0) {
        this.deleteFailures.set(failures);
      }

      const failedIds = new Set(failures.map((f) => f.id));
      this.items.update((current) =>
        current.filter((item) => failedIds.has(item.id) || !ids.includes(item.id)),
      );

      const deletedCount = ids.length - failures.length;
      this.meta.update((m) => (m ? { ...m, total: Math.max(0, m.total - deletedCount) } : m));

      if (failures.length === 0) {
        this.exitSelectionMode();
      } else {
        this.selectedIds.set(new Set(failures.map((f) => f.id)));
      }
      return;
    }

    const id = ids[index];

    this.deletingIds.update((s) => new Set([...s, id]));

    this.mediaService.deleteMedia(id).subscribe({
      next: () => {
        this.deletingIds.update((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        this.runSequentialDeletes(ids, index + 1, failures);
      },
      error: () => {
        this.deletingIds.update((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        const failedItem = this.items().find((i) => i.id === id);
        const newFailures = [...failures, { id, mimeType: failedItem?.mimeType ?? 'unknown' }];
        this.runSequentialDeletes(ids, index + 1, newFailures);
      },
    });
  }

  dismissFailures(): void {
    this.deleteFailures.set([]);
  }

  openPlayer(item: MediaCard): void {
    this.playback.detach();
    this.activeVideo.set(item);
    this.playbackError.set(false);

    setTimeout(() => {
      const videoEl = this.videoElRef?.nativeElement;
      if (!videoEl) return;

      this.playback.attach(videoEl, item.url, item.mimeType).catch(() => {
        this.playbackError.set(true);
      });
    }, 0);
  }

  closePlayer(): void {
    this.playback.detach();
    this.activeVideo.set(null);
    this.playbackError.set(false);
  }

  family(item: MediaItem): 'image' | 'video' | 'other' {
    return mediaFamily(item.mimeType);
  }

  hasMorePages(): boolean {
    const m = this.meta();
    return m !== null && m.totalPages > 1;
  }

  activeVideoDuration(): string | null {
    return this.activeVideo()?.durationSeconds ?? null;
  }

  videoAriaLabel(item: MediaItem): string | null {
    return this.family(item) === 'video' ? `Play ${item.mimeType}` : null;
  }

  formatDuration(seconds: string | null): string {
    if (!seconds) return '0:00';
    const total = Math.floor(parseFloat(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
