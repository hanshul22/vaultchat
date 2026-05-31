import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="login-container">
      <div class="login-card">
        <h1>VaultChat</h1>
        <h2>Sign in</h2>

        @if (error()) {
          <div class="error-banner">{{ error() }}</div>
        }

        <form (ngSubmit)="onSubmit()">
          <div class="field">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              [(ngModel)]="email"
              name="email"
              placeholder="you@example.com"
              required
              autocomplete="email"
            />
          </div>

          <div class="field">
            <label for="password">Password</label>
            <input
              id="password"
              type="password"
              [(ngModel)]="password"
              name="password"
              placeholder="••••••••"
              required
              autocomplete="current-password"
            />
          </div>

          <button type="submit" [disabled]="loading()">
            {{ loading() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [
    `
      .login-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: #f0f2f5;
      }
      .login-card {
        background: #fff;
        border-radius: 12px;
        padding: 2.5rem 2rem;
        width: 100%;
        max-width: 380px;
        box-shadow: 0 2px 16px rgba(0, 0, 0, 0.1);
      }
      h1 {
        margin: 0 0 0.25rem;
        font-size: 1.6rem;
        color: #1a73e8;
      }
      h2 {
        margin: 0 0 1.5rem;
        font-size: 1.1rem;
        font-weight: 400;
        color: #555;
      }
      .field {
        display: flex;
        flex-direction: column;
        margin-bottom: 1rem;
      }
      label {
        font-size: 0.85rem;
        font-weight: 600;
        margin-bottom: 0.35rem;
        color: #333;
      }
      input {
        padding: 0.6rem 0.75rem;
        border: 1px solid #ccc;
        border-radius: 6px;
        font-size: 1rem;
        outline: none;
        transition: border-color 0.2s;
      }
      input:focus {
        border-color: #1a73e8;
      }
      button {
        width: 100%;
        padding: 0.7rem;
        background: #1a73e8;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 1rem;
        cursor: pointer;
        margin-top: 0.5rem;
        transition: background 0.2s;
      }
      button:hover:not(:disabled) {
        background: #1558b0;
      }
      button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .error-banner {
        background: #fce8e6;
        color: #c5221f;
        border-radius: 6px;
        padding: 0.6rem 0.75rem;
        margin-bottom: 1rem;
        font-size: 0.9rem;
      }
    `,
  ],
})
export class LoginPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);

  onSubmit(): void {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set(null);

    this.authService.login(this.email, this.password).subscribe({
      next: () => {
        void this.router.navigate(['/chat']);
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Login failed. Please try again.');
      },
    });
  }
}
