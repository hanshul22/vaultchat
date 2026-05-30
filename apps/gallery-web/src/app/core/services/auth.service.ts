import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import { API_BASE_URL } from '../tokens/api-base-url.token';
import { AuthState } from '../models/auth-state.model';
import { AuthResponse } from '../models/auth-response.model';
import { User } from '../models/user.model';

/**
 * Gallery-web AuthService.
 *
 * Satisfies the {@link SharedAuthService} contract so it can be bound to
 * SHARED_AUTH_SERVICE and consumed by the shared interceptors and guard.
 *
 * Keeps the same in-memory token + HttpOnly-cookie-refresh pattern as
 * auth-web. No localStorage or sessionStorage is used.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  private readonly authStateSubject = new BehaviorSubject<AuthState>({
    accessToken: null,
    user: null,
  });

  readonly authState$: Observable<AuthState> = this.authStateSubject.asObservable();

  readonly user$: Observable<User | null> = this.authState$.pipe(map((state) => state.user));

  readonly accessToken$: Observable<string | null> = this.authState$.pipe(
    map((state) => state.accessToken),
  );

  readonly isAuthenticated$: Observable<boolean> = this.authState$.pipe(
    map((state) => !!state.accessToken),
  );

  get snapshot(): AuthState {
    return this.authStateSubject.getValue();
  }

  /**
   * Calls POST /auth/refresh with the HttpOnly cookie and stores the new
   * access token in memory. Used by the shared guard and retry interceptor.
   */
  refresh(): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiBaseUrl}/auth/refresh`, {}, { withCredentials: true })
      .pipe(tap((response) => this.setAuthState(response)));
  }

  /**
   * Loads the current user profile and updates the in-memory state.
   * Called after a successful refresh to populate user details.
   */
  loadMe(): Observable<User> {
    return this.http.get<User>(`${this.apiBaseUrl}/users/me`, { withCredentials: true }).pipe(
      tap((user) =>
        this.authStateSubject.next({
          accessToken: this.snapshot.accessToken,
          user,
        }),
      ),
    );
  }

  /** Clears the in-memory token and calls the logout endpoint. */
  logout(): Observable<void> {
    return this.http
      .post<void>(`${this.apiBaseUrl}/auth/logout`, {}, { withCredentials: true })
      .pipe(tap(() => this.clearAuthState()));
  }

  setAuthState(response: AuthResponse): void {
    this.authStateSubject.next({
      accessToken: response.accessToken,
      user: response.user,
    });
  }

  clearAuthState(): void {
    this.authStateSubject.next({ accessToken: null, user: null });
  }
}
