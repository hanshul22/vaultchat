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
  templateUrl: './albums-page.component.html',
  styleUrl: './albums-page.component.scss',
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
