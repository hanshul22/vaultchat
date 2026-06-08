import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-app-home-page',
  standalone: true,
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-home-page.component.html',
  styleUrl: './app-home-page.component.scss',
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
