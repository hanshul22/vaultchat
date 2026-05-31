import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { switchMap, take } from 'rxjs/operators';

import { SHARED_AUTH_SERVICE } from './auth-service.token';

/**
 * Shared functional HTTP interceptor that attaches the in-memory access token
 * as a Bearer Authorization header.
 *
 * Behaviour (identical to the original auth-web implementation):
 *   - Reads the current token from the injected {@link SHARED_AUTH_SERVICE}.
 *   - Adds `Authorization: Bearer <token>` only when a token is present.
 *   - Never overrides an existing `Authorization` header.
 *   - Passes the request through unchanged when no token is available.
 *
 * Usage — register in each app's `appConfig`:
 * ```ts
 * provideHttpClient(withInterceptors([authTokenInterceptor, ...]))
 * { provide: SHARED_AUTH_SERVICE, useExisting: AuthService }
 * ```
 */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(SHARED_AUTH_SERVICE);

  return authService.accessToken$.pipe(
    take(1),
    switchMap((token) => {
      if (token && !req.headers.has('Authorization')) {
        const authReq = req.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        });
        return next(authReq);
      }
      return next(req);
    }),
  );
};
