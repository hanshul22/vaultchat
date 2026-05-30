import { inject } from '@angular/core';
import { HttpContextToken, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { catchError, switchMap, take } from 'rxjs/operators';
import { throwError } from 'rxjs';

import { SHARED_AUTH_SERVICE } from './auth-service.token';

/**
 * Marks a request as already retried to prevent infinite refresh loops.
 * Declared at module scope so the same token instance is shared across all
 * interceptor invocations within a single Angular injector.
 */
export const IS_RETRY = new HttpContextToken<boolean>(() => false);

/**
 * Shared functional HTTP interceptor that handles 401 Unauthorized responses
 * by attempting a single silent token refresh and retrying the original request.
 *
 * Behaviour (identical to the original auth-web implementation):
 *   - Passes the request through unchanged when the URL contains `/auth/refresh`
 *     to avoid an infinite refresh loop.
 *   - On a 401 response, calls {@link SHARED_AUTH_SERVICE.refresh()} once.
 *   - Reads the freshly stored token and retries the original request with it.
 *   - Marks the retried request with {@link IS_RETRY} so a second 401 is not
 *     retried again.
 *   - If the refresh call itself fails, propagates the original 401 error.
 *
 * Usage — register after `authTokenInterceptor` in each app's `appConfig`:
 * ```ts
 * provideHttpClient(withInterceptors([authTokenInterceptor, refreshRetryInterceptor]))
 * { provide: SHARED_AUTH_SERVICE, useExisting: AuthService }
 * ```
 */
export const refreshRetryInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(SHARED_AUTH_SERVICE);

  // Never attempt refresh on the refresh endpoint itself.
  if (req.url.includes('/auth/refresh')) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error) => {
      // Only handle 401 Unauthorized.
      if ((error as { status?: number })?.status !== 401) {
        return throwError(() => error);
      }

      // If this request was already a retry, do not refresh again.
      if (req.context.get(IS_RETRY)) {
        return throwError(() => error);
      }

      // Attempt refresh once, then retry the original request.
      return authService.refresh().pipe(
        switchMap(() =>
          // Read the freshly stored token and attach it to the cloned request.
          authService.accessToken$.pipe(
            take(1),
            switchMap((token) => {
              const retryReq = buildRetryRequest(req, token);
              return next(retryReq);
            }),
          ),
        ),
        // If refresh itself fails, propagate the original 401 error.
        catchError(() => throwError(() => error)),
      );
    }),
  );
};

/**
 * Clones the original request for retry:
 *   - Marks it with {@link IS_RETRY} so the interceptor won't loop.
 *   - Replaces the Authorization header with the refreshed token when present.
 *   - Preserves all other headers and context.
 */
function buildRetryRequest(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  if (token) {
    return req.clone({
      context: req.context.set(IS_RETRY, true),
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return req.clone({
    context: req.context.set(IS_RETRY, true),
  });
}
