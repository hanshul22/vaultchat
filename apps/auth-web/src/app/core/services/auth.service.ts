import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import { API_BASE_URL } from '../tokens/api-base-url.token';
import { AuthState } from '../models/auth-state.model';
import { AuthResponse } from '../models/auth-response.model';
import { LoginPayload } from '../models/login-payload.model';
import { SignupPayload } from '../models/signup-payload.model';
import { ForgotPasswordPayload } from '../models/forgot-password-payload.model';
import { ResetPasswordPayload } from '../models/reset-password-payload.model';
import { User } from '../models/user.model';

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

  signup(payload: SignupPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiBaseUrl}/auth/signup`, payload, {
        withCredentials: true,
      })
      .pipe(tap((response) => this.setAuthState(response)));
  }

  login(payload: LoginPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiBaseUrl}/auth/login`, payload, {
        withCredentials: true,
      })
      .pipe(tap((response) => this.setAuthState(response)));
  }

  forgotPassword(payload: ForgotPasswordPayload): Observable<void> {
    return this.http.post<void>(`${this.apiBaseUrl}/auth/forgot-password`, payload, {
      withCredentials: true,
    });
  }

  resetPassword(payload: ResetPasswordPayload): Observable<void> {
    return this.http.post<void>(`${this.apiBaseUrl}/auth/reset-password`, payload, {
      withCredentials: true,
    });
  }

  refresh(): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(
        `${this.apiBaseUrl}/auth/refresh`,
        {},
        {
          withCredentials: true,
        },
      )
      .pipe(tap((response) => this.setAuthState(response)));
  }

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

  logout(): Observable<void> {
    return this.http
      .post<void>(
        `${this.apiBaseUrl}/auth/logout`,
        {},
        {
          withCredentials: true,
        },
      )
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
