import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-signup-page',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, RouterLink],
  template: `
    <section class="auth-page">
      <p class="eyebrow">GET STARTED</p>
      <h1>Create your account</h1>
      <p class="intro">Set up your VaultChat account to continue.</p>

      <form class="auth-form" [formGroup]="form" (ngSubmit)="onSubmit()">
        <mat-form-field appearance="outline">
          <mat-label>Full Name</mat-label>
          <input matInput formControlName="fullName" autocomplete="name" />
          @if (form.get('fullName')?.touched && form.get('fullName')?.hasError('required')) {
            <mat-error>Full name is required</mat-error>
          }
          @if (form.get('fullName')?.touched && form.get('fullName')?.hasError('minlength')) {
            <mat-error>Must be at least 2 characters</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Email</mat-label>
          <input matInput formControlName="email" type="email" autocomplete="email" />
          @if (form.get('email')?.touched && form.get('email')?.hasError('required')) {
            <mat-error>Email is required</mat-error>
          }
          @if (form.get('email')?.touched && form.get('email')?.hasError('email')) {
            <mat-error>Enter a valid email address</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Password</mat-label>
          <input matInput formControlName="password" type="password" autocomplete="new-password" />
          @if (form.get('password')?.touched && form.get('password')?.hasError('required')) {
            <mat-error>Password is required</mat-error>
          }
          @if (form.get('password')?.touched && form.get('password')?.hasError('minlength')) {
            <mat-error>Password must be at least 8 characters</mat-error>
          }
        </mat-form-field>

        @if (errorMessage) {
          <p class="error-message">{{ errorMessage }}</p>
        }

        <button type="submit" [disabled]="form.invalid || isSubmitting">
          {{ isSubmitting ? 'Creating account...' : 'Create account' }}
        </button>
      </form>

      <p class="auth-link">
        Already have an account?
        <a routerLink="/login">Sign in</a>
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
export class SignupPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
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

    this.authService.signup(this.form.getRawValue()).subscribe({
      next: () => {
        this.isSubmitting = false;
        void this.router.navigate(['/onboarding/instructions']);
      },
      error: () => {
        this.isSubmitting = false;
        this.errorMessage = 'Unable to create account. Please try again.';
      },
    });
  }
}
