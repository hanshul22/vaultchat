import { InjectionToken } from '@angular/core';

/**
 * URL the {@link authGuard} sends unauthenticated users to when a silent
 * refresh fails.
 *
 * Two supported forms:
 *   - A relative route (default `/login`) — used by apps that host their own
 *     login page. The guard navigates with the Angular router.
 *   - An absolute URL (e.g. `http://localhost:4200/login`) — used by apps that
 *     delegate authentication to a separate front-end (gallery-web → auth-web).
 *     The guard performs a full-page redirect so navigation leaves the SPA and
 *     does NOT bounce off the `**` wildcard route back into a guarded page,
 *     which would otherwise create an infinite refresh loop.
 */
export const AUTH_LOGIN_URL = new InjectionToken<string>('AUTH_LOGIN_URL', {
  factory: () => '/login',
});

/** True when the configured login URL points at a different origin/app. */
export function isExternalLoginUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
