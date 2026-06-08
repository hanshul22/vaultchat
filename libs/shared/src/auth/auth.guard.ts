import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, map, switchMap, take } from 'rxjs/operators';
import { Observable, of } from 'rxjs';

import { SHARED_AUTH_SERVICE } from './auth-service.token';
import { AUTH_LOGIN_URL, isExternalLoginUrl } from './auth-login-url.token';

/**
 * Shared route guard that protects routes requiring authentication.
 *
 * Behaviour:
 *   1. If an access token is already in memory → allow navigation immediately.
 *   2. If no token is present → attempt a single silent refresh using the
 *      HttpOnly refresh cookie (covers page-reload scenarios where the
 *      in-memory token was lost but the cookie is still valid).
 *   3. If the refresh succeeds → allow navigation.
 *   4. If the refresh fails → send the user to the configured login URL
 *      ({@link AUTH_LOGIN_URL}).
 *
 * The login URL is configurable so apps that delegate authentication to a
 * separate front-end (e.g. gallery-web → auth-web) can redirect to an absolute
 * URL. In that case the guard performs a full-page redirect and cancels the
 * in-app navigation, which is essential: routing to a non-existent in-app
 * `/login` would fall through to the `**` wildcard, bounce back to a guarded
 * page, and trigger another refresh — an infinite loop that floods
 * `POST /auth/refresh` and trips the server rate limiter (429).
 *
 * Usage — reference in each app's route config:
 * ```ts
 * { path: 'dashboard', canActivate: [authGuard], ... }
 * ```
 * The app must also provide `{ provide: SHARED_AUTH_SERVICE, useExisting: AuthService }`
 * and, when login lives in another app, `{ provide: AUTH_LOGIN_URL, useValue: '...' }`.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(SHARED_AUTH_SERVICE);
  const router = inject(Router);
  const loginUrl = inject(AUTH_LOGIN_URL);

  const redirectToLogin = (): UrlTree | boolean => {
    if (isExternalLoginUrl(loginUrl)) {
      // Full-page navigation out of the SPA. Returning false cancels the
      // in-app route change so we never hit the `**` wildcard.
      window.location.href = loginUrl;
      return false;
    }
    return router.createUrlTree([loginUrl]);
  };

  return authService.isAuthenticated$.pipe(
    take(1),
    switchMap((isAuthenticated): Observable<boolean | UrlTree> => {
      // Already authenticated — allow navigation immediately.
      if (isAuthenticated) {
        return of(true);
      }

      // No in-memory token: attempt a silent refresh using the HttpOnly
      // refresh cookie before deciding to redirect.
      return authService.refresh().pipe(
        map(() => true as const),
        catchError(() => of(redirectToLogin())),
      );
    }),
  );
};
