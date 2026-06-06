import { InjectionToken } from '@angular/core';

/** Injection token for the API base URL (e.g. http://localhost:3000/api/v1). */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');
