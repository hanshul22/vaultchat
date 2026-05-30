import { Album } from './album.model';
import { PaginationMeta } from './paginated-media-response.model';

/**
 * Typed response for GET /api/v1/albums.
 *
 * Matches the `AlbumListResponseDto` shape produced by the Phase 8 backend:
 * ```json
 * {
 *   "data": [ ...AlbumResponseDto[] ],
 *   "meta": { "page": 1, "limit": 40, "total": 12, "totalPages": 1 }
 * }
 * ```
 *
 * Re-uses {@link PaginationMeta} from the media response model because the
 * shape is identical — both follow the PRD §12 `{ data, meta }` convention.
 */
export interface PaginatedAlbumsResponse {
  data: Album[];
  meta: PaginationMeta;
}
