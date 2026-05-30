import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthShellComponent } from '../../shared/auth-shell/auth-shell.component';

@Component({
  selector: 'app-onboarding-instructions-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, AuthShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-shell
      eyebrow="Onboarding"
      title="Connect your Cloudinary account"
      description="VaultChat stores your media in your own Cloudinary account."
    >
      <ul class="auth-page__steps">
        <li>Create a free Cloudinary account if you don’t have one yet.</li>
        <li>Copy your Cloud name, API key, and API secret from the dashboard.</li>
        <li>Paste them into the next step to finish setup.</li>
      </ul>

      <div class="auth-page__actions">
        <a mat-flat-button color="primary" routerLink="/onboarding/cloudinary-setup">
          Continue to setup
        </a>
        <a mat-button routerLink="/login">Back to login</a>
      </div>
    </app-auth-shell>
  `,
  styles: [
    `
      .auth-page__steps {
        margin: 0;
        padding-left: 20px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 14px;
        color: #374151;
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
export class OnboardingInstructionsPageComponent {}
