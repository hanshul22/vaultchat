import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login-page.component').then(
        (m) => m.LoginPageComponent,
      ),
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./features/signup/signup-page.component').then(
        (m) => m.SignupPageComponent,
      ),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/forgot-password/forgot-password-page.component').then(
        (m) => m.ForgotPasswordPageComponent,
      ),
  },
  {
    path: 'onboarding/instructions',
    loadComponent: () =>
      import(
        './features/onboarding/onboarding-instructions-page.component'
      ).then((m) => m.OnboardingInstructionsPageComponent),
  },
  {
    path: 'onboarding/cloudinary-setup',
    loadComponent: () =>
      import('./features/onboarding/cloudinary-setup-page.component').then(
        (m) => m.CloudinarySetupPageComponent,
      ),
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
