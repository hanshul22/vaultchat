import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../tokens/api-base-url.token';
import { PaginatedAlbumsResponse } from '../models/paginated-albums-response.model';

/** Parameters for {@link AlbumsService.getAlbums}. */
export interface GetAlbumsParams {
  page?: number;
  limit?: number;
}

/**
 * Read-only Angular service for the albums list endpoint.
 *
 * Calls GET /api/v1/albums and returns typed {@link PaginatedAlbumsResponse}
 * objects. Authentication is handled transparently by the shared auth
 * interceptors registered in app.config.ts.
 *
 * Mutation endpoints (create, update, delete, add/remove media) are out of
 * scope for this step and will be added in a later phase.
 */
@Injectable({ providedIn: 'root' })
export class AlbumsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  /**
   * Fetches a page of the authenticated user's albums, newest first.
   *
   * @param params  Optional page and limit (defaults: page=1, limit=40).
   * @returns       Observable of the typed paginated response.
   */
  getAlbums(params: GetAlbumsParams = {}): Observable<PaginatedAlbumsResponse> {
    let httpParams = new HttpParams();

    if (params.page != null) {
      httpParams = httpParams.set('page', String(params.page));
    }
    if (params.limit != null) {
      httpParams = httpParams.set('limit', String(params.limit));
    }

    return this.http.get<PaginatedAlbumsResponse>(`${this.apiBaseUrl}/albums`, {
      params: httpParams,
      withCredentials: true,
    });
  }
}
