import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * /uploads — placeholder for the upload pipeline UI.
 *
 * The full upload flow (file picker, client-side compression via
 * ffmpeg.wasm for videos, progress tracking, and Vault account selection)
 * will be implemented in a later phase.
 */
@Component({
  selector: 'app-uploads-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="uploads-page">
      <h1 class="uploads-page__title">Uploads</h1>
      <p class="uploads-page__hint">
        The upload pipeline — file picker, optional ffmpeg.wasm compression, progress tracking, and
        Vault account selection — will be added in the next phase.
      </p>
    </div>
  `,
  styles: [
    `
      .uploads-page__title {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0 0 0.5rem;
      }
      .uploads-page__hint {
        color: #6b7280;
        margin: 0;
      }
    `,
  ],
})
export class UploadsPageComponent {}
