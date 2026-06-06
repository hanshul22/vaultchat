import { Album } from '../entities/album.entity';

/**
 * Lightweight media stub included in the album detail response.
 * Only the fields the UI needs to render a thumbnail strip are exposed.
 */
export class AlbumMediaItemDto {
  mediaId: string;
  addedAt: Date;

  constructor(mediaId: string, addedAt: Date) {
    this.mediaId = mediaId;
    this.addedAt = addedAt;
  }
}

/**
 * Standard album representation returned by list and create/update endpoints.
 *
 * Does NOT include the full media list — use AlbumDetailResponseDto for that.
 * `mediaCount` is always populated so the UI can show "42 items" without a
 * second request.
 */
export class AlbumResponseDto {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  coverMediaId: string | null;
  mediaCount: number;
  createdAt: Date;
  updatedAt: Date;

  constructor(album: Album, mediaCount: number) {
    this.id = album.id;
    this.ownerId = album.ownerId;
    this.name = album.name;
    this.description = album.description;
    this.coverMediaId = album.coverMediaId;
    this.mediaCount = mediaCount;
    this.createdAt = album.createdAt;
    this.updatedAt = album.updatedAt;
  }
}

/**
 * Detail response for GET /api/albums/:id.
 *
 * Extends the list shape with a lightweight ordered media list (mediaId +
 * addedAt only — the gallery fetches full media details separately).
 * Ordered by addedAt DESC to match the index on album_media.
 */
export class AlbumDetailResponseDto extends AlbumResponseDto {
  /** Media items in this album, newest-added first. */
  media: AlbumMediaItemDto[];

  constructor(album: Album, mediaCount: number, media: AlbumMediaItemDto[]) {
    super(album, mediaCount);
    this.media = media;
  }
}

/**
 * Paginated envelope for GET /api/albums, following the
 * `{ data, meta }` list convention from PRD §12.
 */
export class AlbumListResponseDto {
  data: AlbumResponseDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  constructor(
    items: Array<{ album: Album; mediaCount: number }>,
    page: number,
    limit: number,
    total: number,
  ) {
    this.data = items.map(({ album, mediaCount }) => new AlbumResponseDto(album, mediaCount));
    this.meta = {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    };
  }
}
