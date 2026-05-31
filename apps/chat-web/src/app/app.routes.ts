import { Route } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'chat',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/chat-shell/chat-shell-page.component').then(
        (m) => m.ChatShellPageComponent,
      ),
    children: [
      {
        path: ':conversationId',
        loadComponent: () =>
          import('./features/chat-shell/chat-shell-page.component').then(
            (m) => m.ChatShellPageComponent,
          ),
      },
    ],
  },
  { path: '', redirectTo: 'chat', pathMatch: 'full' },
  { path: '**', redirectTo: 'chat' },
];
