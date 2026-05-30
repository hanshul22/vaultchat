import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * /albums — placeholder for the album list and management UI.
 *
 * The full album list (create, rename, delete, cover image) will be
 * implemented once the gallery-web API client layer is wired up.
 */
@Component({
  selector: 'app-albums-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="albums-page">
      <h1 class="albums-page__title">Albums</h1>
      <p class="albums-page__hint">
        Your album list and management controls will appear here — create, rename, and organise
        albums from your Vault media.
      </p>
    </div>
  `,
  styles: [
    `
      .albums-page__title {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0 0 0.5rem;
      }
      .albums-page__hint {
        color: #6b7280;
        margin: 0;
      }
    `,
  ],
})
export class AlbumsPageComponent {}
