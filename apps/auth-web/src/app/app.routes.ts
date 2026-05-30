import { Route } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';

export const appRoutes: Route[] = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./features/signup/signup-page.component').then((m) => m.SignupPageComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/forgot-password/forgot-password-page.component').then(
        (m) => m.ForgotPasswordPageComponent,
      ),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/reset-password/reset-password-page.component').then(
        (m) => m.ResetPasswordPageComponent,
      ),
  },
  {
    path: 'onboarding/instructions',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/onboarding/onboarding-instructions-page.component').then(
        (m) => m.OnboardingInstructionsPageComponent,
      ),
  },
  {
    path: 'onboarding/cloudinary-setup',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/onboarding/cloudinary-setup-page.component').then(
        (m) => m.CloudinarySetupPageComponent,
      ),
  },
  {
    path: 'app-home',
    loadComponent: () =>
      import('./features/app-home/app-home-page.component').then((m) => m.AppHomePageComponent),
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
