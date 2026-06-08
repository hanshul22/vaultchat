import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

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
  templateUrl: './gallery-shell.component.html',
  styleUrl: './gallery-shell.component.scss',
})
export class GalleryShellComponent {
  private readonly authService = inject(AuthService);

  readonly user$ = this.authService.user$;

  logout(): void {
    this.authService.logout().subscribe({
      complete: () => this.redirectToLogin(),
      error: () => {
        this.authService.clearAuthState();
        this.redirectToLogin();
      },
    });
  }

  private redirectToLogin(): void {
    // Login is hosted by the separate auth-web app, so leave the SPA entirely.
    window.location.href = environment.authWebUrl;
  }
}
