/**
 * Shared auth barrel.
 *
 * Import from `@chat-media/shared/auth` in any app that needs the shared
 * interceptors, guard, or the service token.
 *
 * Each app must provide:
 *   `{ provide: SHARED_AUTH_SERVICE, useExisting: AuthService }`
 * in its `appConfig` providers so the shared pieces can resolve the service.
 */
export { SHARED_AUTH_SERVICE } from './auth-service.token';
export type { SharedAuthService } from './auth-service.token';
export { authTokenInterceptor } from './auth-token.interceptor';
export { refreshRetryInterceptor, IS_RETRY } from './refresh-retry.interceptor';
export { authGuard } from './auth.guard';
