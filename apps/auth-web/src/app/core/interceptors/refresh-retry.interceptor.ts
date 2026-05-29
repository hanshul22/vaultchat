import { inject } from '@angular/core';
import { HttpContextToken, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { catchError, switchMap, take } from 'rxjs/operators';
import { throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

/** Marks a request as already retried to prevent infinite refresh loops. */
const IS_RETRY = new HttpContextToken<boolean>(() => false);

export const refreshRetryInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  // Never attempt refresh on the refresh endpoint itself.
  if (req.url.includes('/auth/refresh')) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error) => {
      // Only handle 401 Unauthorized.
      if (error?.status !== 401) {
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
 * - Marks it with IS_RETRY so the interceptor won't loop.
 * - Replaces the Authorization header with the refreshed token when present.
 * - Preserves all other headers and context.
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
