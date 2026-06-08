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
  templateUrl: './album-detail-page.component.html',
  styleUrl: './album-detail-page.component.scss',
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
