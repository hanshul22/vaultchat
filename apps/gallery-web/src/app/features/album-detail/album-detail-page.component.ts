import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs/operators';
import { AsyncPipe } from '@angular/common';

/**
 * /albums/:id — placeholder for the album detail and media membership UI.
 *
 * Reads the `:id` route parameter and displays it so the routing is
 * verifiable. The full detail view (media grid, add/remove items, cover
 * selection) will be implemented once the gallery-web API client layer is
 * wired up.
 */
@Component({
  selector: 'app-album-detail-page',
  standalone: true,
  imports: [AsyncPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="album-detail-page">
      <h1 class="album-detail-page__title">Album Detail</h1>

      <p class="album-detail-page__id">
        Album ID: <code>{{ albumId$ | async }}</code>
      </p>

      <p class="album-detail-page__hint">
        The album detail view — media membership grid, cover selection, and add/remove controls —
        will be implemented in the next phase.
      </p>
    </div>
  `,
  styles: [
    `
      .album-detail-page__title {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0 0 0.5rem;
      }
      .album-detail-page__id {
        font-size: 0.9rem;
        color: #374151;
        margin: 0 0 0.75rem;
      }
      .album-detail-page__id code {
        background: #f3f4f6;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        font-family: ui-monospace, monospace;
      }
      .album-detail-page__hint {
        color: #6b7280;
        margin: 0;
      }
    `,
  ],
})
export class AlbumDetailPageComponent {
  private readonly route = inject(ActivatedRoute);

  /** The album UUID from the :id route parameter. */
  readonly albumId$ = this.route.paramMap.pipe(map((params) => params.get('id')));
}
