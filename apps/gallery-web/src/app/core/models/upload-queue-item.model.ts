import { MediaUploadPreflightResponse } from './media-upload-preflight.model';
import { MediaUploadResponse } from './media-upload-response.model';

/**
 * Status of a single file in the upload queue.
 *
 * Full state machine:
 *
 *   selected  → checking   → ready         (preflight passed)
 *   selected  → checking   → uploadError   (preflight rejected / network)
 *   ready     → uploading  → uploaded      (upload succeeded)
 *   ready     → uploading  → uploadError   (upload failed)
 *   uploadError → uploading → uploaded     (retry succeeded)
 *   uploadError → uploading → uploadError  (retry failed again)
 *   any       → (removed)                  (user removed the item)
 */
export type UploadQueueStatus =
  | 'selected' // File chosen, preflight not yet run
  | 'checking' // Preflight HTTP call in flight
  | 'ready' // Preflight passed — file can be uploaded directly
  | 'uploading' // POST /api/v1/media/upload in flight
  | 'uploaded' // Upload succeeded — media row created
  | 'uploadError'; // Preflight rejected, upload failed, or client validation failed

/**
 * Frontend-only UI model for a single file in the upload queue.
 *
 * This is a view-model — it is never sent to the backend as-is.
 * The `file` reference is kept so the upload step can read the bytes
 * without re-selecting.
 */
export interface UploadQueueItem {
  /**
   * Stable client-side identifier for this queue entry.
   * Generated from `crypto.randomUUID()` at selection time.
   */
  clientId: string;

  /** Original filename as reported by the browser. */
  filename: string;

  /** File size in bytes (integer). */
  sizeBytes: number;

  /** MIME type as reported by the browser File API. */
  mimeType: string;

  /** Current state of this queue entry. */
  status: UploadQueueStatus;

  /**
   * Human-readable error message shown when status === 'uploadError'.
   * Covers client-side validation failures, preflight rejections, and
   * server-side upload errors.
   */
  errorMessage?: string;

  /**
   * Successful preflight result, populated when status is 'ready',
   * 'uploading', 'uploaded', or 'uploadError' (after a successful preflight).
   * Retained so the upload step can use the target account without
   * re-running preflight.
   */
  preflightResult?: MediaUploadPreflightResponse;

  /**
   * Successful upload response, populated when status === 'uploaded'.
   * Contains the created media row's id, url, and metadata.
   */
  uploadedMedia?: MediaUploadResponse;

  /**
   * Reference to the original browser File object.
   * Used by the upload step to read the file bytes.
   */
  file: File;
}
