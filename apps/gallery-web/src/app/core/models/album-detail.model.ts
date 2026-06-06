import { Album } from './album.model';

/**
 * A single media membership stub as returned by GET /api/v1/albums/:id.
 *
 * The detail endpoint returns only the join-row fields (mediaId + addedAt),
 * not the full MediaItem. The gallery resolves full media details via a
 * separate GET /api/v1/media call when needed.
 *
 * Matches AlbumMediaItemDto from Phase 8.
 */
export interface AlbumMemberStub {
  /** UUID of the media item that belongs to this album. */
  mediaId: string;

  /** ISO-8601 timestamp of when this item was added to the album. */
  addedAt: string;
}

/**
 * Full album detail response from GET /api/v1/albums/:id.
 *
 * Extends the list-item shape (Album) with the ordered media membership list.
 * Media items are ordered by addedAt DESC (newest-added first) as enforced
 * by the backend.
 *
 * Matches AlbumDetailResponseDto from Phase 8.
 */
export interface AlbumDetail extends Album {
  /**
   * Lightweight media membership list — mediaId + addedAt only.
   * Ordered newest-added first.
   * Empty array when the album has no members.
   */
  media: AlbumMemberStub[];
}
