import { Route } from '@angular/router';
import { authGuard } from '@chat-media/shared/auth';

import { GalleryShellComponent } from './shared/gallery-shell/gallery-shell.component';

export const appRoutes: Route[] = [
  {
    path: '',
    redirectTo: 'gallery',
    pathMatch: 'full',
  },
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
      {
        path: 'shared-spaces',
        loadComponent: () =>
          import('./features/shared-spaces/shared-spaces-page.component').then(
            (m) => m.SharedSpacesPageComponent,
          ),
      },
      {
        path: 'shared-spaces/:id',
        loadComponent: () =>
          import('./features/shared-space-detail/shared-space-detail-page.component').then(
            (m) => m.SharedSpaceDetailPageComponent,
          ),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'gallery',
  },
];