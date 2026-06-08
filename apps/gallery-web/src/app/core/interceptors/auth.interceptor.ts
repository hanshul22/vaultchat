import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Deprecated legacy interceptor.
 *
 * gallery-web now uses the shared auth interceptors from @chat-media/shared/auth:
 * - authTokenInterceptor
 * - refreshRetryInterceptor
 *
 * Do not register this interceptor in app.config.ts.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => next(req);