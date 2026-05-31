import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';

import { AlbumsService } from '../../core/services/albums.service';
import { AlbumDetail, AlbumMemberStub } from '../../core/models/album-detail.model';

type LoadState = 'loading' | 'loaded' | 'not-found' | 'error';

/**
 * /albums/:id — real API-backed album detail page.
 *
 * Fetches the album on init using the route :id parameter. Displays album
 * metadata and the lightweight media membership list (mediaId + addedAt)
 * returned by the backend. Full media thumbnails are not shown here because
 * the detail endpoint returns only membership stubs — resolving full MediaItem
 * objects via GET /api/v1/media is deferred to the next phase.
 *
 * Read-only: no add/remove membership or edit/delete controls in this step.
 */
@Component({
  selector: 'app-album-detail-page',
  standalone: true,
  imports: [RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="album-detail">
      <!-- ── Back link ──────────────────────────────────────────────────── -->
      <a routerLink="/albums" class="album-detail__back"> ← Back to Albums </a>

      <!-- ── Loading ────────────────────────────────────────────────────── -->
      @if (loadState() === 'loading') {
        <div class="album-detail__loading" role="status" aria-live="polite">
          <span class="album-detail__spinner" aria-hidden="true"></span>
          <span>Loading album…</span>
        </div>
      }

      <!-- ── Not found ──────────────────────────────────────────────────── -->
      @if (loadState() === 'not-found') {
        <div class="album-detail__not-found" role="alert">
          <p class="album-detail__not-found-title">Album not found</p>
          <p class="album-detail__not-found-hint">
            This album does not exist or you do not have access to it.
          </p>
          <a routerLink="/albums" class="album-detail__back-btn"> Back to Albums </a>
        </div>
      }

      <!-- ── Error ──────────────────────────────────────────────────────── -->
      @if (loadState() === 'error') {
        <div class="album-detail__error" role="alert">
          <p>Could not load this album. Please try again.</p>
          <button type="button" class="album-detail__retry" (click)="load()">Retry</button>
        </div>
      }

      <!-- ── Loaded ─────────────────────────────────────────────────────── -->
      @if (loadState() === 'loaded' && album()) {
        <!-- Album metadata -->
        <header class="album-detail__header">
          <h1 class="album-detail__name">{{ album()!.name }}</h1>

          @if (album()!.description) {
            <p class="album-detail__description">{{ album()!.description }}</p>
          }

          <dl class="album-detail__meta">
            <div class="album-detail__meta-row">
              <dt>Items</dt>
              <dd>{{ album()!.mediaCount }}</dd>
            </div>
            <div class="album-detail__meta-row">
              <dt>Created</dt>
              <dd>
                <time [dateTime]="album()!.createdAt">
                  {{ album()!.createdAt | date: 'dd MMM yyyy, HH:mm' }}
                </time>
              </dd>
            </div>
            <div class="album-detail__meta-row">
              <dt>Updated</dt>
              <dd>
                <time [dateTime]="album()!.updatedAt">
                  {{ album()!.updatedAt | date: 'dd MMM yyyy, HH:mm' }}
                </time>
              </dd>
            </div>
          </dl>
        </header>

        <hr class="album-detail__divider" />

        <!-- Media membership section -->
        <section class="album-detail__members" aria-labelledby="members-heading">
          <h2 id="members-heading" class="album-detail__members-title">
            Media
            <span class="album-detail__members-count">
              {{ album()!.media.length }}
            </span>
          </h2>

          <!-- Empty members state -->
          @if (album()!.media.length === 0) {
            <div class="album-detail__members-empty">
              <p class="album-detail__members-empty-title">No media in this album yet</p>
              <p class="album-detail__members-empty-hint">
                Add media items to this album from the Gallery.
              </p>
            </div>
          }

          <!-- Members list -->
          @if (album()!.media.length > 0) {
            <ul class="album-detail__members-list" aria-label="Album media members">
              @for (member of album()!.media; track member.mediaId) {
                <li class="album-detail__member-row">
                  <!-- Placeholder icon — full thumbnail resolved in next phase -->
                  <span class="album-detail__member-icon" aria-hidden="true">🖼</span>

                  <div class="album-detail__member-info">
                    <code class="album-detail__member-id" title="Media ID">
                      {{ member.mediaId }}
                    </code>
                    <time class="album-detail__member-date" [dateTime]="member.addedAt">
                      Added {{ member.addedAt | date: 'dd MMM yyyy' }}
                    </time>
                  </div>
                </li>
              }
            </ul>

            <p class="album-detail__members-note">
              Full media thumbnails will be shown once the media detail resolver is wired up in the
              next phase.
            </p>
          }
        </section>
      }
    </div>
  `,
  styles: [
    `
      /* ── Page layout ──────────────────────────────────────────────────── */
      .album-detail {
        max-width: 720px;
      }

      /* ── Back link ────────────────────────────────────────────────────── */
      .album-detail__back {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.875rem;
        color: #6366f1;
        text-decoration: none;
        margin-bottom: 1.5rem;
      }

      .album-detail__back:hover {
        text-decoration: underline;
      }

      /* ── Loading ──────────────────────────────────────────────────────── */
      .album-detail__loading {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: #6b7280;
        padding: 3rem 0;
      }

      .album-detail__spinner {
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

      /* ── Not found ────────────────────────────────────────────────────── */
      .album-detail__not-found {
        padding: 3rem 2rem;
        text-align: center;
        color: #6b7280;
      }

      .album-detail__not-found-title {
        font-size: 1.125rem;
        font-weight: 500;
        color: #374151;
        margin: 0 0 0.5rem;
      }

      .album-detail__not-found-hint {
        margin: 0 0 1.5rem;
        font-size: 0.9rem;
      }

      .album-detail__back-btn {
        display: inline-block;
        padding: 0.5rem 1.25rem;
        border-radius: 6px;
        background: #6366f1;
        color: #fff;
        text-decoration: none;
        font-size: 0.875rem;
      }

      .album-detail__back-btn:hover {
        background: #4f46e5;
      }

      /* ── Error ────────────────────────────────────────────────────────── */
      .album-detail__error {
        padding: 2rem;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 8px;
        color: #991b1b;
      }

      .album-detail__retry {
        margin-top: 0.75rem;
        padding: 0.375rem 1rem;
        border-radius: 6px;
        border: 1px solid #fca5a5;
        background: #fff;
        color: #991b1b;
        cursor: pointer;
        font-size: 0.875rem;
      }

      .album-detail__retry:hover {
        background: #fef2f2;
      }

      /* ── Header ───────────────────────────────────────────────────────── */
      .album-detail__header {
        margin-bottom: 1.5rem;
      }

      .album-detail__name {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0 0 0.5rem;
        color: #111827;
      }

      .album-detail__description {
        font-size: 0.95rem;
        color: #4b5563;
        margin: 0 0 1rem;
        line-height: 1.6;
      }

      /* Metadata definition list */
      .album-detail__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 2rem;
        margin: 0;
      }

      .album-detail__meta-row {
        display: flex;
        gap: 0.4rem;
        align-items: baseline;
      }

      .album-detail__meta-row dt {
        font-size: 0.8rem;
        color: #9ca3af;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .album-detail__meta-row dd {
        font-size: 0.875rem;
        color: #374151;
        margin: 0;
      }

      /* ── Divider ──────────────────────────────────────────────────────── */
      .album-detail__divider {
        border: none;
        border-top: 1px solid #e5e7eb;
        margin: 1.5rem 0;
      }

      /* ── Members section ──────────────────────────────────────────────── */
      .album-detail__members-title {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0 0 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .album-detail__members-count {
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

      /* Empty members */
      .album-detail__members-empty {
        padding: 2.5rem 1rem;
        text-align: center;
        color: #6b7280;
        background: #f9fafb;
        border-radius: 8px;
        border: 1px dashed #d1d5db;
      }

      .album-detail__members-empty-title {
        font-size: 1rem;
        font-weight: 500;
        color: #374151;
        margin: 0 0 0.4rem;
      }

      .album-detail__members-empty-hint {
        margin: 0;
        font-size: 0.875rem;
      }

      /* Members list */
      .album-detail__members-list {
        list-style: none;
        margin: 0 0 1rem;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }

      .album-detail__member-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.625rem 0.875rem;
        border-radius: 6px;
        border: 1px solid #e5e7eb;
        background: #fff;
      }

      .album-detail__member-icon {
        font-size: 1.25rem;
        flex-shrink: 0;
      }

      .album-detail__member-info {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        min-width: 0;
      }

      .album-detail__member-id {
        font-family: ui-monospace, monospace;
        font-size: 0.75rem;
        color: #374151;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .album-detail__member-date {
        font-size: 0.7rem;
        color: #9ca3af;
      }

      .album-detail__members-note {
        font-size: 0.75rem;
        color: #9ca3af;
        margin: 0;
        font-style: italic;
      }
    `,
  ],
})
export class AlbumDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly albumsService = inject(AlbumsService);

  readonly loadState = signal<LoadState>('loading');
  readonly album = signal<AlbumDetail | null>(null);

  /** The album UUID from the :id route parameter. */
  private get albumId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const id = this.albumId;
    if (!id) {
      this.loadState.set('not-found');
      return;
    }

    this.loadState.set('loading');

    this.albumsService.getAlbumById(id).subscribe({
      next: (detail) => {
        this.album.set(detail);
        this.loadState.set('loaded');
      },
      error: (err: HttpErrorResponse) => {
        this.loadState.set(err.status === 404 ? 'not-found' : 'error');
      },
    });
  }

  /** Exposes AlbumMemberStub type for template tracking. */
  trackMember(_index: number, member: AlbumMemberStub): string {
    return member.mediaId;
  }
}
