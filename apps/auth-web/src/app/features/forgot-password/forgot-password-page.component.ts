import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthShellComponent } from '../../shared/auth-shell/auth-shell.component';

@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, AuthShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-shell
      eyebrow="Recover access"
      title="Forgot password"
      description="We’ll help you reset your password and get back in."
      [showBackLink]="true"
      backLink="/login"
      backLabel="Back to login"
    >
      <p class="auth-page__placeholder">
        Email field for the reset link will be added in the next step.
      </p>

      <div class="auth-page__actions">
        <button mat-flat-button color="primary" type="button" disabled>
          Send reset link
        </button>
        <a mat-button routerLink="/login">Back to sign in</a>
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
export class ForgotPasswordPageComponent {}
