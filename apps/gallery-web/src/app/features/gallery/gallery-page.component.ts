import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * /gallery — placeholder for the media grid.
 *
 * The full media grid (paginated thumbnails, type filters, infinite scroll)
 * will be implemented in the next phase once the gallery-web API client layer
 * is wired up.
 */
@Component({
  selector: 'app-gallery-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gallery-page">
      <h1 class="gallery-page__title">Gallery</h1>
      <p class="gallery-page__hint">
        Your media grid will appear here — images and videos from your Vault, paginated and
        filterable by type.
      </p>
    </div>
  `,
  styles: [
    `
      .gallery-page__title {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0 0 0.5rem;
      }
      .gallery-page__hint {
        color: #6b7280;
        margin: 0;
      }
    `,
  ],
})
export class GalleryPageComponent {}
