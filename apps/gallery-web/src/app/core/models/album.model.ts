/**
 * Frontend model for a single album, typed against the fields returned by
 * GET /api/v1/albums (AlbumResponseDto from Phase 8).
 *
 * Only fields actually returned by the backend are included. Fields not in
 * the current API response (visibility, collaborators, etc.) are intentionally
 * absent and will be added when the backend exposes them.
 */
export interface Album {
  /** UUID primary key. */
  id: string;

  /** UUID of the owning user. */
  ownerId: string;

  /** Display name of the album (max 120 chars). */
  name: string;

  /** Optional free-text description, or null when not set. */
  description: string | null;

  /**
   * UUID of the media item used as the album cover, or null when no cover
   * has been set. The gallery resolves the cover thumbnail separately.
   */
  coverMediaId: string | null;

  /**
   * Number of media items currently in this album.
   * Always populated by the list endpoint so the UI can show "42 items"
   * without a second request.
   */
  mediaCount: number;

  /** ISO-8601 timestamp of when the album was created. */
  createdAt: string;

  /** ISO-8601 timestamp of the last update to the album row. */
  updatedAt: string;
}
