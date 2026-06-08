import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  SHARED_AUTH_SERVICE,
  authTokenInterceptor,
  refreshRetryInterceptor,
  AUTH_LOGIN_URL,
} from '@chat-media/shared/auth';

import { appRoutes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { API_BASE_URL } from './core/tokens/api-base-url.token';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([authTokenInterceptor, refreshRetryInterceptor])),
    { provide: API_BASE_URL, useValue: environment.apiBaseUrl },
    { provide: SHARED_AUTH_SERVICE, useExisting: AuthService },
    { provide: AUTH_LOGIN_URL, useValue: environment.authWebUrl },
  ],
};