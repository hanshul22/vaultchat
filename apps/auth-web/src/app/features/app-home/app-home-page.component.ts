import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-app-home-page',
  standalone: true,
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-home">
      <p class="app-home__badge">⚠ TEMPORARY — PHASE 6 PLACEHOLDER</p>
      <h1 class="app-home__title">VaultChat App Home</h1>
      <p class="app-home__subtitle">Temporary post-login landing page for onboarded users.</p>
      <p class="app-home__note">
        This page is a placeholder used to verify the end-to-end auth flow while cross-app routing
        to <strong>chat-web</strong> and <strong>gallery-web</strong>
        is not yet wired. It will be replaced once the real post-login destination is available.
      </p>
      <button mat-flat-button color="warn" [disabled]="isLoggingOut()" (click)="logout()">
        {{ isLoggingOut() ? 'Logging out…' : 'Logout' }}
      </button>
    </div>
  `,
  styles: [
    `
      .app-home {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        gap: 16px;
        padding: 32px;
        text-align: center;
        font-family: sans-serif;
      }

      .app-home__badge {
        margin: 0;
        padding: 6px 14px;
        border-radius: 4px;
        background: #fff3cd;
        border: 1px solid #ffc107;
        color: #856404;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.04em;
      }

      .app-home__title {
        margin: 0;
        font-size: 2rem;
      }

      .app-home__subtitle {
        margin: 0;
        color: #6b7280;
        font-size: 1.1rem;
      }

      .app-home__note {
        max-width: 480px;
        margin: 0;
        color: #374151;
        font-size: 0.95rem;
        line-height: 1.6;
      }
    `,
  ],
})
export class AppHomePageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isLoggingOut = signal(false);

  logout(): void {
    if (this.isLoggingOut()) return;
    this.isLoggingOut.set(true);

    this.authService.logout().subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: () => {
        // Even if the server call fails, clear local state and redirect.
        this.authService.clearAuthState();
        void this.router.navigateByUrl('/login');
      },
    });
  }
}
