import { Media } from '../entities/media.entity';

/**
 * Safe public representation of a media item.
 *
 * Deliberately omits internal-only fields (cloudinaryAccountId, isOrphaned,
 * deletedAt) from the default surface that the gallery needs. Byte sizes stay
 * as strings to preserve bigint precision over JSON.
 *
 * The gallery never reveals which Cloudinary account a file lives on
 * (StorageModel.md §8) — `cloudinaryAccountId` is intentionally not exposed.
 */
export class MediaResponseDto {
  id: string;
  ownerId: string;
  storageSpaceId: string | null;
  cloudinaryPublicId: string;
  url: string;
  mimeType: string;
  /** Byte size as a string (BIGINT-safe). */
  sizeBytes: string;
  width: number | null;
  height: number | null;
  /** Seconds with millisecond precision, as a string; null for images. */
  durationSeconds: string | null;
  createdAt: Date;

  constructor(media: Media) {
    this.id = media.id;
    this.ownerId = media.ownerId;
    this.storageSpaceId = media.storageSpaceId;
    this.cloudinaryPublicId = media.cloudinaryPublicId;
    this.url = media.url;
    this.mimeType = media.mimeType;
    this.sizeBytes = media.sizeBytes;
    this.width = media.width;
    this.height = media.height;
    this.durationSeconds = media.durationSeconds;
    this.createdAt = media.createdAt;
  }
}

/**
 * Paginated envelope for GET /api/v1/media, following the
 * `{ data, meta }` list convention from PRD §12.
 */
export class MediaListResponseDto {
  data: MediaResponseDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  constructor(items: Media[], page: number, limit: number, total: number) {
    this.data = items.map((m) => new MediaResponseDto(m));
    this.meta = {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    };
  }
}
