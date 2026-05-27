import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthShellComponent } from '../../shared/auth-shell/auth-shell.component';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, AuthShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-shell
      eyebrow="Welcome back"
      title="Login"
      description="Sign in to continue to VaultChat."
    >
      <p class="auth-page__placeholder">
        Email and password fields will be added in the next step.
      </p>

      <div class="auth-page__actions">
        <button mat-flat-button color="primary" type="button" disabled>
          Continue
        </button>
        <a mat-button routerLink="/signup">Create an account</a>
        <a mat-button routerLink="/forgot-password">Forgot password?</a>
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
export class LoginPageComponent {}
