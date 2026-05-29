import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { AuthShellComponent } from '../../shared/auth-shell/auth-shell.component';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password-page',
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
      eyebrow="Account recovery"
      title="Forgot password"
      description="Enter your email and we’ll send you a password reset link."
    >
      @if (!emailSent) {
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
              {{ isSubmitting ? 'Sending link...' : 'Send reset link' }}
            </button>

            <a mat-button routerLink="/login">Back to login</a>
          </div>
        </form>
      } @else {
        <div class="auth-page__success">
          <p class="auth-page__success-title">Check your email</p>
          <p class="auth-page__success-copy">
            If an account exists for {{ submittedEmail }}, a password reset link has been sent.
          </p>
          <a mat-button routerLink="/login">Back to login</a>
        </div>
      }
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

      .auth-page__success {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .auth-page__success-title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }

      .auth-page__success-copy {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
      }
    `,
  ],
})
export class ForgotPasswordPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  isSubmitting = false;
  emailSent = false;
  submittedEmail = '';
  errorMessage = '';

  onSubmit(): void {
    if (this.form.invalid || this.isSubmitting) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    const { email } = this.form.getRawValue();

    this.authService
      .forgotPassword({ email })
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.submittedEmail = email;
          this.emailSent = true;
          this.cdr.markForCheck();
        },
        error: () => {
          this.errorMessage = 'Unable to send reset link right now. Please try again.';
          this.cdr.markForCheck();
        },
      });
  }
}
