import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, mergeMap, retryWhen } from 'rxjs/operators';

import { API_BASE_URL } from '../../core/tokens/api-base-url.token';
import { DirectUploadCloudinaryResponse } from './direct-upload-cloudinary.models';

// ─── Request / response types for the Phase 12 backend endpoints ─────────────

export interface DirectUploadApiInitRequest {
  fileSizeBytes: number;
  mimeType: string;
  filename: string;
}

/**
 * Structured signed fields returned by /media/direct-upload/init.
 * All signed params are returned as discrete fields — never embedded in a URL
 * query string — so the browser can submit them as FormData fields alongside
 * the file blob, which is the only submission method Cloudinary's signature
 * verification accepts.
 */
export interface DirectUploadInitResult {
  uploadId: string;
  uploadUrl: string;
  cloudName: string;
  resourceType: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
}

export interface DirectUploadApiSignPartRequest {
  uploadId: string;
  partIndex: number;
}

/**
 * Structured signed fields returned by /media/direct-upload/sign-part.
 * Same shape as DirectUploadInitResult (minus uploadId) so both part 0
 * and later parts use the identical FormData submission path.
 */
export interface DirectUploadSignPartResult {
  uploadUrl: string;
  cloudName: string;
  resourceType: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
}

export interface DirectUploadApiCompleteRequest {
  uploadId: string;
  cloudinaryPublicId: string;
  finalSizeBytes: number;
  duration?: string;
  width?: number;
  height?: number;
}

export interface DirectUploadApiAbortRequest {
  uploadId: string;
}

export interface DirectUploadPartResult {
  public_id: string;
  bytes: number;
  secure_url?: string;
}

// ─── Retry delays for Cloudinary transient failures ──────────────────────────

const CLOUDINARY_RETRY_DELAYS_MS = [2000, 4000, 8000] as const;

/** True when the error should be retried (network or 5xx). */
function isRetryableCloudinaryError(error: unknown): boolean {
  if (error instanceof CloudinaryPartUploadError) {
    return error.isNetworkError || (error.status !== undefined && error.status >= 500 && error.status < 600);
  }
  return false;
}

class CloudinaryPartUploadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly isNetworkError = false,
  ) {
    super(message);
    this.name = 'CloudinaryPartUploadError';
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * HTTP client for the Phase 12 browser-to-Cloudinary direct upload flow.
 *
 * Backend routes:
 *   POST   /media/direct-upload/init       → init a session, get signed URL for part 0
 *   POST   /media/direct-upload/sign-part  → get signed URL for subsequent parts
 *   POST   /media/direct-upload/complete   → finalise, write Media row
 *   DELETE /media/direct-upload/abort      → release reservation, cleanup
 *
 * Binary data never passes through the API backend — only FormData
 * goes browser → Cloudinary using the server-issued signed URLs.
 */
@Injectable({ providedIn: 'root' })
export class DirectUploadApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  // ── 1. Init ──────────────────────────────────────────────────────────────

  /**
   * Initialises a new upload session on the backend.
   * Returns the backend-generated uploadId and a signed URL ready to POST
   * the first file part to Cloudinary.
   */
  initDirectUpload(request: DirectUploadApiInitRequest): Observable<DirectUploadInitResult> {
    return this.http.post<DirectUploadInitResult>(
      `${this.apiBaseUrl}/media/direct-upload/init`,
      request,
      { withCredentials: true },
    );
  }

  // ── 2. Sign part ─────────────────────────────────────────────────────────

  /**
   * Obtains a signed URL for the next sequential chunk.
   * The backend enforces strict ordering; out-of-order requests → 409.
   */
  signPart(request: DirectUploadApiSignPartRequest): Observable<DirectUploadSignPartResult> {
    return this.http.post<DirectUploadSignPartResult>(
      `${this.apiBaseUrl}/media/direct-upload/sign-part`,
      request,
      { withCredentials: true },
    );
  }

  // ── 3. Complete ──────────────────────────────────────────────────────────

  /**
   * Finalises the upload session.  Writes the Media row to Postgres and
   * releases the byte reservation.
   */
  completeDirectUpload(request: DirectUploadApiCompleteRequest): Observable<unknown> {
    return this.http.post(
      `${this.apiBaseUrl}/media/direct-upload/complete`,
      request,
      { withCredentials: true },
    );
  }

  // ── 4. Abort ─────────────────────────────────────────────────────────────

  /**
   * Aborts the session.  Idempotent — safe to call even if the session
   * has already expired.  Uses DELETE with a JSON body per the backend spec.
   */
  abortDirectUpload(request: DirectUploadApiAbortRequest): Observable<void> {
    return this.http.delete<void>(
      `${this.apiBaseUrl}/media/direct-upload/abort`,
      {
        body: request,
        withCredentials: true,
      },
    );
  }

  // ── 5. Upload part to Cloudinary ─────────────────────────────────────────

  /**
   * POSTs a single file blob directly to Cloudinary.
   *
   * All signed params (api_key, timestamp, signature, folder, public_id) are
   * submitted as FormData fields alongside the file. This is the ONLY method
   * Cloudinary's signature verification accepts — embedding signed params in
   * the query string causes a mismatch because Cloudinary computes the
   * expected signature solely from the FormData body fields.
   *
   * Retries transient (network / 5xx) failures with 2 s → 4 s → 8 s backoff.
   * 4xx failures abort immediately without retry.
   */
  uploadPartToCloudinary(args: {
    uploadUrl: string;
    apiKey: string;
    timestamp: number;
    signature: string;
    folder: string;
    publicId: string;
    file: Blob;
  }): Observable<DirectUploadPartResult> {
    return new Observable<DirectUploadPartResult>((subscriber) => {
      this.doUploadPartWithRetry(args)
        .then((result) => {
          subscriber.next(result);
          subscriber.complete();
        })
        .catch((error: unknown) => {
          subscriber.error(error);
        });
    });
  }

  // ── Retry helper (also exposed for testability) ───────────────────────────

  /**
   * Wraps an Observable with Cloudinary retry policy:
   *   - delays: 2 s, 4 s, 8 s
   *   - retries on network errors and 5xx responses
   *   - does NOT retry 4xx responses
   */
  withCloudinaryRetry<T>(source$: Observable<T>): Observable<T> {
    let attempt = 0;
    return source$.pipe(
      retryWhen((errors$) =>
        errors$.pipe(
          mergeMap((error) => {
            if (!isRetryableCloudinaryError(error) || attempt >= CLOUDINARY_RETRY_DELAYS_MS.length) {
              return throwError(() => error);
            }
            const delay = CLOUDINARY_RETRY_DELAYS_MS[attempt];
            attempt += 1;
            return timer(delay);
          }),
        ),
      ),
      catchError((error) => throwError(() => error)),
    );
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async doUploadPartWithRetry(
    args: {
      uploadUrl: string;
      apiKey: string;
      timestamp: number;
      signature: string;
      folder: string;
      publicId: string;
      file: Blob;
    },
  ): Promise<DirectUploadPartResult> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.doUploadPart(args);
      } catch (error) {
        if (!isRetryableCloudinaryError(error) || attempt >= CLOUDINARY_RETRY_DELAYS_MS.length) {
          throw error;
        }
        await this.delay(CLOUDINARY_RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  private async doUploadPart(
    args: {
      uploadUrl: string;
      apiKey: string;
      timestamp: number;
      signature: string;
      folder: string;
      publicId: string;
      file: Blob;
    },
  ): Promise<DirectUploadPartResult> {
    // All signed params MUST be submitted as FormData fields.
    // Cloudinary's signature is computed over FormData body params only —
    // query-string values are ignored during verification.
    const formData = new FormData();
    formData.append('file', args.file);
    formData.append('api_key', args.apiKey);
    formData.append('timestamp', String(args.timestamp));
    formData.append('signature', args.signature);
    formData.append('folder', args.folder);
    formData.append('public_id', args.publicId);

    console.debug('[DirectUpload] Uploading part to Cloudinary', {
      uploadUrl: args.uploadUrl,
      folder: args.folder,
      public_id: args.publicId,
      timestamp: args.timestamp,
    });

    let response: Response;
    try {
      response = await fetch(args.uploadUrl, {
        method: 'POST',
        body: formData,
      });
    } catch (error) {
      throw new CloudinaryPartUploadError(
        error instanceof Error ? error.message : 'Network error while uploading to Cloudinary.',
        undefined,
        true,
      );
    }

    const body = await this.parseResponseBody(response);

    if (!response.ok) {
      const message = this.extractErrorMessage(body) ?? `Cloudinary upload failed with status ${response.status}.`;
      throw new CloudinaryPartUploadError(message, response.status);
    }

    if (!this.isSuccessBody(body)) {
      throw new CloudinaryPartUploadError(
        'Cloudinary upload response was missing public_id or bytes.',
        response.status,
      );
    }

    return {
      public_id: body.public_id,
      bytes: body.bytes,
      secure_url: body.secure_url,
    };
  }

  private async parseResponseBody(response: Response): Promise<DirectUploadCloudinaryResponse | { error?: { message?: string } } | null> {
    try {
      return (await response.json()) as DirectUploadCloudinaryResponse | { error?: { message?: string } };
    } catch {
      return null;
    }
  }

  private isSuccessBody(value: unknown): value is DirectUploadCloudinaryResponse {
    return (
      typeof value === 'object' &&
      value !== null &&
      'public_id' in value &&
      typeof (value as DirectUploadCloudinaryResponse).public_id === 'string' &&
      'bytes' in value &&
      typeof (value as DirectUploadCloudinaryResponse).bytes === 'number'
    );
  }

  private extractErrorMessage(body: unknown): string | undefined {
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as { error?: unknown }).error === 'object' &&
      (body as { error?: { message?: unknown } }).error !== null
    ) {
      const msg = (body as { error?: { message?: unknown } }).error?.message;
      return typeof msg === 'string' ? msg : undefined;
    }
    return undefined;
  }

  private delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
