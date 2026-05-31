/**
 * Typed response from POST /api/v1/media/upload.
 *
 * Matches MediaResponseDto from Phase 7 exactly. Only fields actually
 * returned by the backend are included — no invented fields.
 *
 * Byte sizes are strings to preserve BIGINT precision over JSON.
 */
export interface MediaUploadResponse {
  /** UUID of the newly created media row. */
  id: string;

  /** UUID of the owning user. */
  ownerId: string;

  /** UUID of the shared storage space, or null for personal media. */
  storageSpaceId: string | null;

  /**
   * Cloudinary public_id — used to build transformation URLs client-side.
   * Example: "vaultchat/user-uuid/abc123"
   */
  cloudinaryPublicId: string;

  /** Canonical Cloudinary delivery URL for the uploaded asset. */
  url: string;

  /** Full MIME type, e.g. "image/jpeg" or "video/mp4". */
  mimeType: string;

  /** File size in bytes, serialised as a string (BIGINT-safe). */
  sizeBytes: string;

  /** Pixel width, or null when not available. */
  width: number | null;

  /** Pixel height, or null when not available. */
  height: number | null;

  /**
   * Video/audio duration in seconds with millisecond precision, as a string.
   * Null for images.
   */
  durationSeconds: string | null;

  /** ISO-8601 timestamp of when the item was created. */
  createdAt: string;
}
