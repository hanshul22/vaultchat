import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { take, map, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isAuthenticated$.pipe(
    take(1),
    switchMap((isAuthenticated) => {
      // Already authenticated — allow navigation immediately.
      if (isAuthenticated) {
        return of(true);
      }

      // No in-memory token: attempt a silent refresh using the HttpOnly
      // refresh cookie before deciding to redirect. This covers the case
      // where the page was reloaded and the access token was lost from
      // memory but the refresh cookie is still valid.
      return authService.refresh().pipe(
        map(() => true as const),
        catchError(() => of(router.createUrlTree(['/login']))),
      );
    }),
  );
};
