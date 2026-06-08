import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';

/**
 * Top-level shell for gallery-web.
 *
 * Provides the persistent navigation bar (Gallery, Albums, Uploads, Shared Spaces)
 * and the router outlet where page components are rendered. Logout clears the
 * local auth state and redirects to the login page.
 */
@Component({
  selector: 'app-gallery-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AsyncPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gallery-shell">
      <header class="gallery-shell__header">
        <span class="gallery-shell__brand">VaultChat Gallery</span>

        <nav class="gallery-shell__nav" aria-label="Main navigation">
          <a
            routerLink="/gallery"
            routerLinkActive="gallery-shell__nav-link--active"
            class="gallery-shell__nav-link"
            >Gallery</a
          >
          <a
            routerLink="/albums"
            routerLinkActive="gallery-shell__nav-link--active"
            class="gallery-shell__nav-link"
            >Albums</a
          >
          <a
            routerLink="/uploads"
            routerLinkActive="gallery-shell__nav-link--active"
            class="gallery-shell__nav-link"
            >Uploads</a
          >
          <a
            routerLink="/shared-spaces"
            routerLinkActive="gallery-shell__nav-link--active"
            class="gallery-shell__nav-link"
            >Shared Spaces</a
          >
        </nav>

        @if (user$ | async; as user) {
          <div class="gallery-shell__user">
            <span class="gallery-shell__user-name">{{ user.fullName }}</span>
            <button type="button" class="gallery-shell__logout" (click)="logout()">Sign out</button>
          </div>
        }
      </header>

      <main class="gallery-shell__content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      .gallery-shell {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }

      .gallery-shell__header {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        padding: 0 1.5rem;
        height: 56px;
        background: #1a1a2e;
        color: #fff;
      }

      .gallery-shell__brand {
        font-weight: 600;
        font-size: 1.1rem;
        letter-spacing: -0.01em;
        margin-right: auto;
      }

      .gallery-shell__nav {
        display: flex;
        gap: 0.25rem;
      }

      .gallery-shell__nav-link {
        padding: 0.375rem 0.75rem;
        border-radius: 6px;
        color: rgba(255, 255, 255, 0.75);
        text-decoration: none;
        font-size: 0.9rem;
        transition:
          background 150ms,
          color 150ms;
      }

      .gallery-shell__nav-link:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }

      .gallery-shell__nav-link--active {
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
      }

      .gallery-shell__user {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-left: 1rem;
      }

      .gallery-shell__user-name {
        font-size: 0.875rem;
        color: rgba(255, 255, 255, 0.8);
      }

      .gallery-shell__logout {
        padding: 0.25rem 0.75rem;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        background: transparent;
        color: rgba(255, 255, 255, 0.8);
        font-size: 0.8rem;
        cursor: pointer;
        transition:
          background 150ms,
          color 150ms;
      }

      .gallery-shell__logout:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }

      .gallery-shell__content {
        flex: 1;
        padding: 2rem 1.5rem;
      }
    `,
  ],
})
export class GalleryShellComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly user$ = this.authService.user$;

  logout(): void {
    this.authService.logout().subscribe({
      complete: () => void this.router.navigateByUrl('/login'),
      error: () => {
        this.authService.clearAuthState();
        void this.router.navigateByUrl('/login');
      },
    });
  }

}

}

