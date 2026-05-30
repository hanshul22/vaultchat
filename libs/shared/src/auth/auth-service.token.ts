import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Minimal contract the shared auth interceptors and guard require from
 * whichever AuthService an app provides.
 *
 * Each app (auth-web, gallery-web, …) provides its own concrete AuthService
 * against this token so the shared lib never imports app-local code.
 */
export interface SharedAuthService {
  /** Emits the current in-memory access token (null when unauthenticated). */
  readonly accessToken$: Observable<string | null>;
  /** Emits true when an access token is present in memory. */
  readonly isAuthenticated$: Observable<boolean>;
  /**
   * Calls POST /auth/refresh with the HttpOnly cookie and stores the new
   * access token in memory. Completes on success, errors on failure.
   */
  refresh(): Observable<unknown>;
}

/**
 * Injection token for the shared auth service contract.
 *
 * Provide it in each app's `appConfig` providers:
 *
 * ```ts
 * { provide: SHARED_AUTH_SERVICE, useExisting: AuthService }
 * ```
 */
export const SHARED_AUTH_SERVICE = new InjectionToken<SharedAuthService>('SHARED_AUTH_SERVICE');
