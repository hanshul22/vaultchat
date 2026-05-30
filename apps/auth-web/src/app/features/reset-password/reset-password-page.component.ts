import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/services/auth.service';

const passwordsMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const newPassword = control.get('newPassword')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  return newPassword && confirmPassword && newPassword !== confirmPassword
    ? { passwordsMismatch: true }
    : null;
};

@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, RouterLink],
  template: `
    <section class="auth-page">
      <p class="eyebrow">RESET PASSWORD</p>
      <h1>Create a new password</h1>
      <p class="intro">Enter and confirm your new password below.</p>

      @if (!token) {
        <p class="error-message">This reset link is invalid or incomplete.</p>
      } @else {
        <form class="auth-form" [formGroup]="form" (ngSubmit)="onSubmit()">
          <mat-form-field appearance="outline">
            <mat-label>New Password</mat-label>
            <input
              matInput
              formControlName="newPassword"
              type="password"
              autocomplete="new-password"
            />
            @if (
              form.get('newPassword')?.touched && form.get('newPassword')?.hasError('required')
            ) {
              <mat-error>Password is required</mat-error>
            }
            @if (
              form.get('newPassword')?.touched && form.get('newPassword')?.hasError('minlength')
            ) {
              <mat-error>Password must be at least 8 characters</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Confirm Password</mat-label>
            <input
              matInput
              formControlName="confirmPassword"
              type="password"
              autocomplete="new-password"
            />
            @if (
              form.get('confirmPassword')?.touched &&
              form.get('confirmPassword')?.hasError('required')
            ) {
              <mat-error>Please confirm your password</mat-error>
            }
            @if (form.get('confirmPassword')?.touched && form.hasError('passwordsMismatch')) {
              <mat-error>Passwords do not match</mat-error>
            }
          </mat-form-field>

          @if (errorMessage) {
            <p class="error-message">{{ errorMessage }}</p>
          }

          <button type="submit" [disabled]="form.invalid || isSubmitting">
            {{ isSubmitting ? 'Resetting password...' : 'Reset password' }}
          </button>
        </form>
      }

      <p class="auth-link">
        <a routerLink="/login">Back to login</a>
      </p>
    </section>
  `,
  styles: [
    `
      .auth-page {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }

      .eyebrow {
        margin: 0;
        font-size: 0.875rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: #6b7280;
      }

      h1 {
        margin: 0;
        font-size: 2rem;
        line-height: 1.1;
      }

      .intro {
        margin: 0;
        color: #6b7280;
        font-size: 1.125rem;
      }

      .auth-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-top: 0.5rem;
      }

      mat-form-field {
        width: 100%;
      }

      button[type='submit'] {
        width: 100%;
      }

      .error-message {
        margin: 0;
        color: #b00020;
      }

      .auth-link {
        margin: 0.5rem 0 0;
        text-align: center;
      }
    `,
  ],
})
export class ResetPasswordPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  token: string | null = null;
  isSubmitting = false;
  errorMessage = '';

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');
  }

  onSubmit(): void {
    if (this.form.invalid || this.isSubmitting || !this.token) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    this.authService
      .resetPassword({
        token: this.token,
        password: this.form.getRawValue().newPassword,
      })
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          void this.router.navigate(['/login'], {
            queryParams: { reset: 'success' },
          });
        },
        error: () => {
          this.isSubmitting = false;
          this.errorMessage = 'This reset link is invalid or has expired.';
        },
      });
  }
}
