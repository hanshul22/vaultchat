import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthShellComponent } from '../../shared/auth-shell/auth-shell.component';

@Component({
  selector: 'app-signup-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, AuthShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-shell
      eyebrow="Get started"
      title="Create your account"
      description="Set up your VaultChat account to continue."
    >
      <p class="auth-page__placeholder">
        Signup form fields will be added in the next step.
      </p>

      <div class="auth-page__actions">
        <button mat-flat-button color="primary" type="button" disabled>
          Create account
        </button>
        <a mat-button routerLink="/login">Already have an account? Sign in</a>
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
export class SignupPageComponent {}
