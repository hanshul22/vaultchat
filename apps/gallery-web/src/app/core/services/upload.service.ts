import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../tokens/api-base-url.token';
import {
  MediaUploadPreflightResponse,
  PreflightRequest,
} from '../models/media-upload-preflight.model';
import { MediaUploadResponse } from '../models/media-upload-response.model';
import { FileSplitResult } from '../models/video-processing.model';

/** Optional metadata that may accompany a direct upload. */
export interface DirectUploadOptions {
  /**
   * UUID of a shared storage space to file the upload under.
   * Omit (or pass null) for personal Vault uploads.
   */
  storageSpaceId?: string | null;
}

/**
 * Callback invoked after each chunk completes during a sequential multipart
 * upload. Allows the caller to update per-item progress in the UI.
 */
export type ChunkProgressCallback = (completedPartIndex: number, totalParts: number) => void;

/**
 * Upload service — preflight + direct upload + sequential multipart upload.
 *
 * Calls:
 *   POST /api/v1/media/upload/preflight  — quota/MIME check without consuming storage
 *   POST /api/v1/media/upload            — single-part or per-chunk multipart upload
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
   * FormData fields:
   *   - `file`           — the binary file part (required)
   *   - `storageSpaceId` — optional UUID string
   *
   * @param file     The browser File object to upload.
   * @param options  Optional metadata (storageSpaceId).
   */
  uploadFile(file: File, options: DirectUploadOptions = {}): Observable<MediaUploadResponse> {
    const form = new FormData();
    form.append('file', file, file.name);

    if (options.storageSpaceId) {
      form.append('storageSpaceId', options.storageSpaceId);
    }

    return this.http.post<MediaUploadResponse>(`${this.apiBaseUrl}/media/upload`, form, {
      withCredentials: true,
    });
  }

  /**
   * Uploads a split file sequentially, one chunk at a time.
   *
   * Each chunk is sent to POST /api/v1/media/upload with the following
   * FormData fields (in addition to the binary `file` part):
   *   - `mediaId`       — client UUID tying all chunks to one logical item
   *   - `partIndex`     — 0-based chunk index
   *   - `totalParts`    — total number of chunks
   *   - `totalFileSize` — total byte size of the original file
   *   - `storageSpaceId` — optional, forwarded from options
   *
   * Note: the current backend (Phase 7 MediaUploadDto) only validates
   * `storageSpaceId`; the multipart fields are included for forward-
   * compatibility and are stripped by the backend's `whitelist: true`
   * ValidationPipe without causing errors.
   *
   * Stops immediately on the first chunk failure and throws the error.
   * The `onChunkComplete` callback is invoked after each successful chunk
   * so the UI can update progress without waiting for all chunks.
   *
   * @param splitResult     Output of VideoProcessingService.splitFile().
   * @param options         Optional metadata (storageSpaceId).
   * @param onChunkComplete Called after each chunk with (completedIndex, total).
   * @returns               The MediaUploadResponse from the final chunk.
   */
  async uploadChunked(
    splitResult: FileSplitResult,
    options: DirectUploadOptions = {},
    onChunkComplete?: ChunkProgressCallback,
  ): Promise<MediaUploadResponse> {
    let lastResponse: MediaUploadResponse | null = null;

    for (const chunk of splitResult.chunks) {
      const form = new FormData();
      form.append('file', chunk.file, chunk.file.name);

      // Multipart metadata — forward-compatible with a future backend extension.
      form.append('mediaId', splitResult.mediaId);
      form.append('partIndex', String(chunk.partIndex));
      form.append('totalParts', String(chunk.totalParts));
      form.append('totalFileSize', String(splitResult.totalFileSize));

      if (options.storageSpaceId) {
        form.append('storageSpaceId', options.storageSpaceId);
      }

      // Upload this chunk and wait for it to complete before moving on.
      // firstValueFrom converts the Observable to a Promise so we can
      // await it inside the for-loop without subscribing manually.
      lastResponse = await firstValueFrom(
        this.http.post<MediaUploadResponse>(`${this.apiBaseUrl}/media/upload`, form, {
          withCredentials: true,
        }),
      );

      onChunkComplete?.(chunk.partIndex, chunk.totalParts);
    }

    if (!lastResponse) {
      throw new Error('uploadChunked: no chunks were uploaded.');
    }

    return lastResponse;
  }
}
