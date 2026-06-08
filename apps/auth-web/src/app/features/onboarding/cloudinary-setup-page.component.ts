import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthShellComponent } from '../../shared/auth-shell/auth-shell.component';

@Component({
  selector: 'app-cloudinary-setup-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, AuthShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-shell
      eyebrow="Cloudinary setup"
      title="Add your Cloudinary credentials"
      description="You’ll enter your Cloud name, API key, and API secret in the next step."
      [showBackLink]="true"
      backLink="/onboarding/instructions"
      backLabel="Back to instructions"
    >

      <p class="auth-page__placeholder">Credential fields will be added in the next step.</p>

      <div class="auth-page__actions">
        <button mat-flat-button color="primary" type="button" disabled>Save and continue</button>
      <p class="auth-page__placeholder">
        Credential fields will be added in the next step.
      </p>

      <div class="auth-page__actions">
        <button mat-flat-button color="primary" type="button" disabled>
          Save and continue
        </button>

        <a mat-button routerLink="/onboarding/instructions">Back to instructions</a>
      </div>
    </app-auth-shell>
  `,
  styles: [
    `
      .auth-page__placeholder {
        margin: 0;
        font-size: 14px;
        color: #6b7280;
      }

      .auth-page__actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: stretch;
      }
    `,
  ],
})
export class CloudinarySetupPageComponent {}
