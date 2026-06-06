import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { API_BASE_URL } from '../tokens/api-base-url.token';
import { MediaItem, cloudinaryThumbUrl } from '../models/media-item.model';
import { PaginatedMediaResponse } from '../models/paginated-media-response.model';

/** Coarse type filter accepted by the listing endpoint. */
export type MediaTypeFilter = 'image' | 'video';

/** Parameters for {@link MediaService.getMedia}. */
export interface GetMediaParams {
  page?: number;
  limit?: number;
  type?: MediaTypeFilter;
}

/**
 * Angular service for the media endpoints.
 *
 * Calls GET /api/v1/media (list) and DELETE /api/v1/media/:id (delete).
 * Maps raw JSON into typed {@link MediaItem} objects and derives Cloudinary
 * thumbnail URLs client-side so the gallery grid can display previews without
 * fetching full-resolution assets.
 *
 * Authentication is handled transparently by the shared auth interceptors
 * registered in app.config.ts — no manual token handling here.
 */
@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  /**
   * Fetches a page of the authenticated user's media items.
   *
   * @param params  Optional page, limit (default 40, max 100), and type filter.
   * @returns       Observable of the typed paginated response.
   */
  getMedia(params: GetMediaParams = {}): Observable<PaginatedMediaResponse> {
    let httpParams = new HttpParams();

    if (params.page != null) {
      httpParams = httpParams.set('page', String(params.page));
    }
    if (params.limit != null) {
      httpParams = httpParams.set('limit', String(params.limit));
    }
    if (params.type != null) {
      httpParams = httpParams.set('type', params.type);
    }

    return this.http
      .get<PaginatedMediaResponse>(`${this.apiBaseUrl}/media`, {
        params: httpParams,
        withCredentials: true,
      })
      .pipe(map((response) => this.enrichResponse(response)));
  }

  /**
   * Deletes a single media item by its UUID.
   *
   * Calls DELETE /api/v1/media/:id. Returns an Observable<void> that
   * completes on success or errors on failure (4xx / 5xx).
   *
   * @param id  UUID of the media item to delete.
   */
  deleteMedia(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/media/${encodeURIComponent(id)}`, {
      withCredentials: true,
    });
  }

  /**
   * Derives thumbnail URLs for each item in the response.
   *
   * The backend stores the canonical Cloudinary delivery URL. We inject a
   * `w_400,h_400,c_fill,q_auto,f_auto` transformation segment so the CDN
   * serves a compact, auto-formatted thumbnail instead of the full asset.
   *
   * Items whose URL does not match the expected Cloudinary pattern are
   * returned unchanged — the gallery falls back to the original URL.
   */
  private enrichResponse(response: PaginatedMediaResponse): PaginatedMediaResponse {
    return {
      ...response,
      data: response.data.map((item) => this.enrichItem(item)),
    };
  }

  private enrichItem(item: MediaItem): MediaItem & { thumbnailUrl: string } {
    return {
      ...item,
      thumbnailUrl: cloudinaryThumbUrl(item.url),
    };
  }
}
