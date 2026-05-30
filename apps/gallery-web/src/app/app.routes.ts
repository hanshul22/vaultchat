import { Route } from '@angular/router';
import { authGuard } from '@chat-media/shared/auth';

import { GalleryShellComponent } from './shared/gallery-shell/gallery-shell.component';

export const appRoutes: Route[] = [
  // Redirect bare root to /gallery.
  {
    path: '',
    redirectTo: 'gallery',
    pathMatch: 'full',
  },

  // All gallery routes live inside the persistent shell and are protected
  // by the shared auth guard. A failed guard redirects to /login (handled
  // by the guard itself — gallery-web has no /login route; the guard sends
  // the user back to auth-web via the /login path which the SPA treats as
  // a redirect to the auth app in production).
  {
    path: '',
    component: GalleryShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'gallery',
        loadComponent: () =>
          import('./features/gallery/gallery-page.component').then((m) => m.GalleryPageComponent),
      },
      {
        path: 'albums',
        loadComponent: () =>
          import('./features/albums/albums-page.component').then((m) => m.AlbumsPageComponent),
      },
      {
        path: 'albums/:id',
        loadComponent: () =>
          import('./features/album-detail/album-detail-page.component').then(
            (m) => m.AlbumDetailPageComponent,
          ),
      },
      {
        path: 'uploads',
        loadComponent: () =>
          import('./features/uploads/uploads-page.component').then((m) => m.UploadsPageComponent),
      },
    ],
  },

  // Catch-all: redirect unknown paths to /gallery (guard will handle auth).
  {
    path: '**',
    redirectTo: 'gallery',
  },
];
