import { MediaItem } from './media-item.model';

/**
 * Pagination metadata returned in the `meta` envelope of list responses,
 * matching the `{ data, meta }` convention from PRD §12.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Typed response for GET /api/v1/media.
 *
 * Matches the `MediaListResponseDto` shape produced by the Phase 7 backend:
 * ```json
 * {
 *   "data": [ ...MediaResponseDto[] ],
 *   "meta": { "page": 1, "limit": 40, "total": 120, "totalPages": 3 }
 * }
 * ```
 */
export interface PaginatedMediaResponse {
  data: MediaItem[];
  meta: PaginationMeta;
}
