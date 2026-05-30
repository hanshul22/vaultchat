import { MediaUploadPreflightResponse } from './media-upload-preflight.model';

/**
 * Status of a single file in the upload queue.
 *
 * State machine:
 *   selected → checking → ready      (preflight passed)
 *   selected → checking → error      (preflight rejected or network error)
 *   selected → removed               (user removed before preflight)
 */
export type UploadQueueStatus =
  | 'selected' // File chosen, preflight not yet run
  | 'checking' // Preflight HTTP call in flight
  | 'ready' // Preflight passed — file can be uploaded
  | 'error'; // Preflight rejected or client-side validation failed

/**
 * Frontend-only UI model for a single file in the upload queue.
 *
 * This is a view-model — it is never sent to the backend as-is.
 * The `file` reference is kept so the actual upload step (next phase)
 * can read the bytes without re-selecting.
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
   * Human-readable error message shown when status === 'error'.
   * Covers both client-side validation failures and backend rejection reasons.
   */
  errorMessage?: string;

  /**
   * Successful preflight result, populated when status === 'ready'.
   * Retained so the upload step (next phase) can use the target account
   * without re-running preflight.
   */
  preflightResult?: MediaUploadPreflightResponse;

  /**
   * Reference to the original browser File object.
   * Kept for the upload step (next phase) — not displayed in the UI.
   */
  file: File;
}
