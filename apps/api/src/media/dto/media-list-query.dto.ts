import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Default page size for GET /api/v1/media (PRD §6.2). */
export const DEFAULT_MEDIA_PAGE_SIZE = 40;
/** Hard ceiling on page size to protect the gallery query (PRD §6.2). */
export const MAX_MEDIA_PAGE_SIZE = 100;

/** Coarse media-type filter accepted by the listing endpoint. */
export type MediaTypeFilter = 'image' | 'video';

/**
 * Query parameters for GET /api/v1/media?page=&limit=&type=.
 *
 * Page-based pagination per PRD §12. Values are coerced from strings because
 * query params arrive as strings; @Type(() => Number) handles that even when
 * no global transforming ValidationPipe is configured.
 */
export class MediaListQueryDto {
  /** 1-based page number. Defaults to 1. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer.' })
  @Min(1, { message: 'page must be 1 or greater.' })
  page = 1;

  /** Items per page. Defaults to 40, capped at 100. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer.' })
  @Min(1, { message: 'limit must be 1 or greater.' })
  @Max(MAX_MEDIA_PAGE_SIZE, {
    message: `limit must not exceed ${MAX_MEDIA_PAGE_SIZE}.`,
  })
  limit: number = DEFAULT_MEDIA_PAGE_SIZE;

  /** Optional coarse filter: only images or only videos. */
  @IsOptional()
  @IsIn(['image', 'video'], { message: "type must be 'image' or 'video'." })
  type?: MediaTypeFilter;
}
