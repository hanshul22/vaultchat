import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import {
  authTokenInterceptor,
  refreshRetryInterceptor,
  SHARED_AUTH_SERVICE,
} from '@chat-media/shared/auth';
import { AuthService } from './core/services/auth.service';

import { appRoutes } from './app.routes';
import { API_BASE_URL } from './core/tokens/api-base-url.token';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([authTokenInterceptor, refreshRetryInterceptor])),
    { provide: API_BASE_URL, useValue: environment.apiBaseUrl },
    // Wire the app's AuthService to the shared auth token so the shared
    // interceptors and guard can resolve it without importing app-local code.
    { provide: SHARED_AUTH_SERVICE, useExisting: AuthService },
  ],
};
