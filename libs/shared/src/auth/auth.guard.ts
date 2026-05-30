import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, switchMap, take } from 'rxjs/operators';
import { of } from 'rxjs';

import { SHARED_AUTH_SERVICE } from './auth-service.token';

/**
 * Shared route guard that protects routes requiring authentication.
 *
 * Behaviour (identical to the original auth-web implementation):
 *   1. If an access token is already in memory → allow navigation immediately.
 *   2. If no token is present → attempt a silent refresh using the HttpOnly
 *      refresh cookie (covers page-reload scenarios where the in-memory token
 *      was lost but the cookie is still valid).
 *   3. If the refresh succeeds → allow navigation.
 *   4. If the refresh fails → redirect to `/login`.
 *
 * Usage — reference in each app's route config:
 * ```ts
 * { path: 'dashboard', canActivate: [authGuard], ... }
 * ```
 * The app must also provide `{ provide: SHARED_AUTH_SERVICE, useExisting: AuthService }`.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(SHARED_AUTH_SERVICE);
  const router = inject(Router);

  return authService.isAuthenticated$.pipe(
    take(1),
    switchMap((isAuthenticated) => {
      // Already authenticated — allow navigation immediately.
      if (isAuthenticated) {
        return of(true);
      }

      // No in-memory token: attempt a silent refresh using the HttpOnly
      // refresh cookie before deciding to redirect.
      return authService.refresh().pipe(
        map(() => true as const),
        catchError(() => of(router.createUrlTree(['/login']))),
      );
    }),
  );
};
