import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';

import { AlbumsService } from '../../core/services/albums.service';
import { Album } from '../../core/models/album.model';
import { PaginationMeta } from '../../core/models/paginated-media-response.model';

type LoadState = 'loading' | 'loaded' | 'error';

/**
 * /albums — real API-backed albums list page.
 *
 * Fetches page 1 of the authenticated user's albums on init. Each card links
 * to /albums/:id for the detail view. No create/edit/delete controls are
 * shown in this step — read-only browsing only.
 */
@Component({
  selector: 'app-albums-page',
  standalone: true,
  imports: [RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="albums-page">
      <!-- ── Header ─────────────────────────────────────────────────────── -->
      <header class="albums-page__header">
        <h1 class="albums-page__title">Albums</h1>
        @if (loadState() === 'loaded') {
          <span class="albums-page__count">
            {{ meta()?.total ?? 0 }} album{{ (meta()?.total ?? 0) === 1 ? '' : 's' }}
          </span>
        }
      </header>

      <!-- ── Loading ────────────────────────────────────────────────────── -->
      @if (loadState() === 'loading') {
        <div class="albums-page__loading" role="status" aria-live="polite">
          <span class="albums-page__spinner" aria-hidden="true"></span>
          <span>Loading your albums…</span>
        </div>
      }

      <!-- ── Error ──────────────────────────────────────────────────────── -->
      @if (loadState() === 'error') {
        <div class="albums-page__error" role="alert">
          <p>Could not load your albums. Please try again.</p>
          <button type="button" class="albums-page__retry" (click)="load()">Retry</button>
        </div>
      }

      <!-- ── Empty state ────────────────────────────────────────────────── -->
      @if (loadState() === 'loaded' && albums().length === 0) {
        <div class="albums-page__empty">
          <p class="albums-page__empty-title">No albums yet</p>
          <p class="albums-page__empty-hint">
            Create your first album to organise your Vault media into collections.
          </p>
        </div>
      }

      <!-- ── Grid ───────────────────────────────────────────────────────── -->
      @if (loadState() === 'loaded' && albums().length > 0) {
        <ul class="albums-grid" aria-label="Albums">
          @for (album of albums(); track album.id) {
            <li>
              <a
                class="album-card"
                [routerLink]="['/albums', album.id]"
                [attr.aria-label]="album.name"
              >
                <!-- Cover placeholder / icon -->
                <div class="album-card__cover">
                  @if (album.coverMediaId) {
                    <!-- Cover image will be resolved in the detail phase -->
                    <span class="album-card__cover-icon" aria-hidden="true">🖼</span>
                  } @else {
                    <span class="album-card__cover-icon" aria-hidden="true">📁</span>
                  }
                </div>

                <!-- Album info -->
                <div class="album-card__body">
                  <p class="album-card__name">{{ album.name }}</p>

                  @if (album.description) {
                    <p class="album-card__description">{{ album.description }}</p>
                  }

                  <div class="album-card__meta">
                    <span class="album-card__count">
                      {{ album.mediaCount }}
                      item{{ album.mediaCount === 1 ? '' : 's' }}
                    </span>
                    <time class="album-card__date" [dateTime]="album.createdAt">
                      {{ album.createdAt | date: 'dd MMM yyyy' }}
                    </time>
                  </div>
                </div>

                <!-- Chevron -->
                <span class="album-card__chevron" aria-hidden="true">›</span>
              </a>
            </li>
          }
        </ul>

        <!-- ── Pagination hint ─────────────────────────────────────────── -->
        @if (meta() && meta()!.totalPages > 1) {
          <p class="albums-page__pagination-hint">
            Showing page {{ meta()!.page }} of {{ meta()!.totalPages }} ({{ meta()!.total }} albums
            total). Full pagination will be added in the next phase.
          </p>
        }
      }
    </div>
  `,
  styles: [
    `
      /* ── Page layout ──────────────────────────────────────────────────── */
      .albums-page {
        max-width: 800px;
      }

      .albums-page__header {
        display: flex;
        align-items: baseline;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
      }

      .albums-page__title {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0;
      }

      .albums-page__count {
        font-size: 0.875rem;
        color: #6b7280;
      }

      /* ── Loading ──────────────────────────────────────────────────────── */
      .albums-page__loading {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: #6b7280;
        padding: 3rem 0;
      }

      .albums-page__spinner {
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
      .albums-page__error {
        padding: 2rem;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 8px;
        color: #991b1b;
      }

      .albums-page__retry {
        margin-top: 0.75rem;
        padding: 0.375rem 1rem;
        border-radius: 6px;
        border: 1px solid #fca5a5;
        background: #fff;
        color: #991b1b;
        cursor: pointer;
        font-size: 0.875rem;
      }

      .albums-page__retry:hover {
        background: #fef2f2;
      }

      /* ── Empty state ──────────────────────────────────────────────────── */
      .albums-page__empty {
        padding: 4rem 2rem;
        text-align: center;
        color: #6b7280;
      }

      .albums-page__empty-title {
        font-size: 1.125rem;
        font-weight: 500;
        color: #374151;
        margin: 0 0 0.5rem;
      }

      .albums-page__empty-hint {
        margin: 0;
        font-size: 0.9rem;
      }

      /* ── Grid ─────────────────────────────────────────────────────────── */
      .albums-grid {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      /* ── Card ─────────────────────────────────────────────────────────── */
      .album-card {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.875rem 1rem;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        background: #fff;
        text-decoration: none;
        color: inherit;
        transition:
          background 150ms,
          box-shadow 150ms;
      }

      .album-card:hover {
        background: #f9fafb;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      }

      .album-card:focus-visible {
        outline: 2px solid #6366f1;
        outline-offset: 2px;
      }

      /* Cover icon area */
      .album-card__cover {
        flex-shrink: 0;
        width: 48px;
        height: 48px;
        border-radius: 6px;
        background: #f3f4f6;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .album-card__cover-icon {
        font-size: 1.5rem;
        line-height: 1;
      }

      /* Body */
      .album-card__body {
        flex: 1;
        min-width: 0;
      }

      .album-card__name {
        font-size: 0.95rem;
        font-weight: 500;
        color: #111827;
        margin: 0 0 0.2rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .album-card__description {
        font-size: 0.8rem;
        color: #6b7280;
        margin: 0 0 0.3rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .album-card__meta {
        display: flex;
        gap: 0.75rem;
        align-items: center;
      }

      .album-card__count {
        font-size: 0.75rem;
        color: #6366f1;
        font-weight: 500;
      }

      .album-card__date {
        font-size: 0.75rem;
        color: #9ca3af;
      }

      /* Chevron */
      .album-card__chevron {
        flex-shrink: 0;
        font-size: 1.25rem;
        color: #d1d5db;
        line-height: 1;
      }

      /* ── Pagination hint ──────────────────────────────────────────────── */
      .albums-page__pagination-hint {
        margin-top: 1.5rem;
        font-size: 0.8rem;
        color: #9ca3af;
        text-align: center;
      }
    `,
  ],
})
export class AlbumsPageComponent implements OnInit {
  private readonly albumsService = inject(AlbumsService);

  readonly loadState = signal<LoadState>('loading');
  readonly albums = signal<Album[]>([]);
  readonly meta = signal<PaginationMeta | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loadState.set('loading');

    this.albumsService.getAlbums({ page: 1 }).subscribe({
      next: (response) => {
        this.albums.set(response.data);
        this.meta.set(response.meta);
        this.loadState.set('loaded');
      },
      error: () => {
        this.loadState.set('error');
      },
    });
  }

}

}

