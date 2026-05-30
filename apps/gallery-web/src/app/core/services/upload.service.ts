import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../tokens/api-base-url.token';
import {
  MediaUploadPreflightResponse,
  PreflightRequest,
} from '../models/media-upload-preflight.model';
import { MediaUploadResponse } from '../models/media-upload-response.model';

/** Optional metadata that may accompany a direct upload. */
export interface DirectUploadOptions {
  /**
   * UUID of a shared storage space to file the upload under.
   * Omit (or pass null) for personal Vault uploads.
   */
  storageSpaceId?: string | null;
}

/**
 * Upload service — preflight + direct upload.
 *
 * Calls:
 *   POST /api/v1/media/upload/preflight  — quota/MIME check without consuming storage
 *   POST /api/v1/media/upload            — multipart upload of a single file
 *
 * ffmpeg.wasm compression and chunk splitting are intentionally deferred to
 * a later phase. This service handles only single-part direct uploads.
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

  /**
   * Uploads a single file directly to POST /api/v1/media/upload.
   *
   * Builds a `multipart/form-data` request using the exact field names the
   * backend expects:
   *   - `file`           — the binary file part (required, handled by Multer)
   *   - `storageSpaceId` — optional UUID string (handled by MediaUploadDto)
   *
   * On success the observable emits a {@link MediaUploadResponse} containing
   * the created media row's metadata.
   *
   * On failure the observable errors with an `HttpErrorResponse`. Callers
   * should inspect `error.status` and `error.error` for structured messages.
   *
   * @param file     The browser `File` object to upload.
   * @param options  Optional metadata (storageSpaceId).
   */
  uploadFile(file: File, options: DirectUploadOptions = {}): Observable<MediaUploadResponse> {
    const form = new FormData();

    // Field name must match the FileInterceptor('file', ...) in the controller.
    form.append('file', file, file.name);

    // Optional metadata field — only append when a value is provided.
    if (options.storageSpaceId) {
      form.append('storageSpaceId', options.storageSpaceId);
    }

    return this.http.post<MediaUploadResponse>(`${this.apiBaseUrl}/media/upload`, form, {
      withCredentials: true,
    });
  }
}
