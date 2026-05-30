import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import { MediaService } from '../../core/services/media.service';
import { MediaItem, mediaFamily } from '../../core/models/media-item.model';
import { PaginationMeta } from '../../core/models/paginated-media-response.model';

/** View-model enriched with the derived thumbnail URL. */
interface MediaCard extends MediaItem {
  thumbnailUrl: string;
}

type LoadState = 'loading' | 'loaded' | 'error';

/**
 * /gallery — real API-backed media grid.
 *
 * Fetches page 1 of the authenticated user's media on init, renders a
 * responsive thumbnail grid, and distinguishes images from videos with a
 * type badge. Thumbnails use the Cloudinary w_400,h_400,c_fill,q_auto,f_auto
 * transform so the CDN serves compact previews.
 */
@Component({
  selector: 'app-gallery-page',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gallery-page">
      <!-- ── Header ─────────────────────────────────────────────────────── -->
      <header class="gallery-page__header">
        <h1 class="gallery-page__title">Gallery</h1>
        @if (loadState() === 'loaded') {
          <span class="gallery-page__count">
            {{ meta()?.total ?? 0 }} item{{ (meta()?.total ?? 0) === 1 ? '' : 's' }}
          </span>
        }
      </header>

      <!-- ── Loading ────────────────────────────────────────────────────── -->
      @if (loadState() === 'loading') {
        <div class="gallery-page__loading" role="status" aria-live="polite">
          <span class="gallery-page__spinner" aria-hidden="true"></span>
          <span>Loading your media…</span>
        </div>
      }

      <!-- ── Error ──────────────────────────────────────────────────────── -->
      @if (loadState() === 'error') {
        <div class="gallery-page__error" role="alert">
          <p>Could not load your media. Please try again.</p>
          <button type="button" class="gallery-page__retry" (click)="load()">Retry</button>
        </div>
      }

      <!-- ── Empty state ────────────────────────────────────────────────── -->
      @if (loadState() === 'loaded' && items().length === 0) {
        <div class="gallery-page__empty">
          <p class="gallery-page__empty-title">No media yet</p>
          <p class="gallery-page__empty-hint">
            Upload your first image or video using the Uploads tab.
          </p>
        </div>
      }

      <!-- ── Grid ───────────────────────────────────────────────────────── -->
      @if (loadState() === 'loaded' && items().length > 0) {
        <ul class="gallery-grid" aria-label="Media items">
          @for (item of items(); track item.id) {
            <li class="gallery-card">
              <!-- Thumbnail -->
              <div class="gallery-card__thumb-wrap">
                <img
                  class="gallery-card__thumb"
                  [src]="item.thumbnailUrl"
                  [alt]="item.mimeType"
                  loading="lazy"
                  decoding="async"
                  width="400"
                  height="400"
                />

                <!-- Video overlay icon -->
                @if (family(item) === 'video') {
                  <span class="gallery-card__play" aria-hidden="true">▶</span>
                }

                <!-- Type badge -->
                <span
                  class="gallery-card__badge"
                  [class.gallery-card__badge--video]="family(item) === 'video'"
                >
                  {{ family(item) === 'video' ? 'VIDEO' : 'IMAGE' }}
                </span>
              </div>

              <!-- Meta -->
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

        <!-- ── Pagination hint ─────────────────────────────────────────── -->
        @if (meta() && meta()!.totalPages > 1) {
          <p class="gallery-page__pagination-hint">
            Showing page {{ meta()!.page }} of {{ meta()!.totalPages }} ({{ meta()!.total }} items
            total). Full pagination will be added in the next phase.
          </p>
        }
      }
    </div>
  `,
  styles: [
    `
      /* ── Page layout ──────────────────────────────────────────────────── */
      .gallery-page {
        max-width: 1200px;
      }

      .gallery-page__header {
        display: flex;
        align-items: baseline;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
      }

      .gallery-page__title {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0;
      }

      .gallery-page__count {
        font-size: 0.875rem;
        color: #6b7280;
      }

      /* ── Loading ──────────────────────────────────────────────────────── */
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

      /* ── Error ────────────────────────────────────────────────────────── */
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

      /* ── Empty state ──────────────────────────────────────────────────── */
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

      /* ── Grid ─────────────────────────────────────────────────────────── */
      .gallery-grid {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 1rem;
      }

      /* ── Card ─────────────────────────────────────────────────────────── */
      .gallery-card {
        border-radius: 8px;
        overflow: hidden;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        transition:
          box-shadow 150ms,
          transform 150ms;
      }

      .gallery-card:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
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

      /* Video play overlay */
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

      /* Type badge */
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

      /* Meta row */
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

      /* ── Pagination hint ──────────────────────────────────────────────── */
      .gallery-page__pagination-hint {
        margin-top: 1.5rem;
        font-size: 0.8rem;
        color: #9ca3af;
        text-align: center;
      }
    `,
  ],
})
export class GalleryPageComponent implements OnInit {
  private readonly mediaService = inject(MediaService);

  readonly loadState = signal<LoadState>('loading');
  readonly items = signal<MediaCard[]>([]);
  readonly meta = signal<PaginationMeta | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loadState.set('loading');

    this.mediaService.getMedia({ page: 1 }).subscribe({
      next: (response) => {
        // The service enriches each item with thumbnailUrl.
        this.items.set(response.data as MediaCard[]);
        this.meta.set(response.meta);
        this.loadState.set('loaded');
      },
      error: () => {
        this.loadState.set('error');
      },
    });
  }

  /** Returns the coarse media family for a card. */
  family(item: MediaItem): 'image' | 'video' | 'other' {
    return mediaFamily(item.mimeType);
  }

  /**
   * Formats a decimal seconds string into a human-readable duration.
   * e.g. "125.500" → "2:05"
   */
  formatDuration(seconds: string): string {
    const total = Math.floor(parseFloat(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
