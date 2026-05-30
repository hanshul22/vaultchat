import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../tokens/api-base-url.token';
import {
  MediaUploadPreflightResponse,
  PreflightRequest,
} from '../models/media-upload-preflight.model';

/**
 * Upload service — preflight-only for this step.
 *
 * Calls POST /api/v1/media/upload/preflight to validate a file against the
 * backend's MIME allowlist and Vault capacity before any bytes are sent.
 *
 * The actual upload (POST /api/v1/media/upload multipart) and any
 * ffmpeg.wasm compression are intentionally deferred to the next phase.
 *
 * Authentication is handled transparently by the shared auth interceptors
 * registered in app.config.ts.
 */
@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  /**
   * Runs the backend preflight check for a single file.
   *
   * The backend validates:
   *   - MIME type against the server-side allowlist (→ 415 on failure)
   *   - File size against the 100 MB ceiling (→ 400 on failure)
   *   - Vault capacity (→ 507 VAULT_FULL or FILE_TOO_LARGE_FOR_ANY_ACCOUNT)
   *
   * On a 2xx response the observable emits a {@link MediaUploadPreflightResponse}
   * with `canUpload: true` and the target account details.
   *
   * On a 4xx/5xx response the observable errors — callers should catch and
   * inspect `error.error` for the structured backend error body.
   *
   * @param fileSizeBytes  File size in bytes (integer, 1 – 104_857_600).
   * @param mimeType       Declared MIME type, e.g. "image/jpeg".
   */
  checkPreflight(
    fileSizeBytes: number,
    mimeType: string,
  ): Observable<MediaUploadPreflightResponse> {
    const body: PreflightRequest = { fileSizeBytes, mimeType };

    return this.http.post<MediaUploadPreflightResponse>(
      `${this.apiBaseUrl}/media/upload/preflight`,
      body,
      { withCredentials: true },
    );
  }
}
