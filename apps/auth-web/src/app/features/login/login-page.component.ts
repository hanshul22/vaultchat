import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { finalize, take } from 'rxjs/operators';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { AuthShellComponent } from '../../shared/auth-shell/auth-shell.component';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    AuthShellComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-shell
      eyebrow="Welcome back"
      title="Login"
      description="Sign in to continue to VaultChat."
    >
      <form class="auth-form" [formGroup]="form" (ngSubmit)="onSubmit()">
        <mat-form-field appearance="outline">
          <mat-label>Email</mat-label>
          <input matInput type="email" formControlName="email" autocomplete="email" />
          @if (form.controls.email.hasError('required')) {
            <mat-error>Email is required.</mat-error>
          }
          @if (form.controls.email.hasError('email')) {
            <mat-error>Enter a valid email address.</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Password</mat-label>
          <input
            matInput
            type="password"
            formControlName="password"
            autocomplete="current-password"
          />
          @if (form.controls.password.hasError('required')) {
            <mat-error>Password is required.</mat-error>
          }
        </mat-form-field>

        @if (errorMessage) {
          <p class="auth-page__error">{{ errorMessage }}</p>
        }

        <div class="auth-page__actions">
          <button
            mat-flat-button
            color="primary"
            type="submit"
            [disabled]="isSubmitting || form.invalid"
          >
            {{ isSubmitting ? 'Signing in...' : 'Continue' }}
          </button>

          <a mat-button routerLink="/signup">Create an account</a>
          <a mat-button routerLink="/forgot-password">Forgot password?</a>
        </div>
      </form>
    </app-auth-shell>
  `,
  styles: [
    `
      .auth-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .auth-page__actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: stretch;
      }

      .auth-page__error {
        margin: 0;
        font-size: 14px;
        color: #b3261e;
      }
    `,
  ],
})
export class LoginPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  isSubmitting = false;
  errorMessage = '';

  onSubmit(): void {
    if (this.form.invalid || this.isSubmitting) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    this.authService
      .login(this.form.getRawValue())
      .pipe(
        take(1),
        finalize(() => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (response) => {
          const nextRoute = response.user.onboardingComplete
            ? '/app-home'
            : '/onboarding/instructions';

          void this.router.navigateByUrl(nextRoute);
        },
        error: () => {
          this.errorMessage = 'Unable to sign in. Please check your credentials.';
          this.cdr.markForCheck();
        },
      });
  }
}
