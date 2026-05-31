import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Default page size for GET /api/albums (PRD §12). */
export const DEFAULT_ALBUM_PAGE_SIZE = 40;
/** Hard ceiling on page size. */
export const MAX_ALBUM_PAGE_SIZE = 100;

/**
 * Query parameters for GET /api/albums?page=&limit=.
 *
 * Mirrors the pagination convention used by MediaListQueryDto.
 * @Type(() => Number) coerces query-string values without requiring a global
 * transforming ValidationPipe.
 */
export class AlbumListQueryDto {
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
  @Max(MAX_ALBUM_PAGE_SIZE, {
    message: `limit must not exceed ${MAX_ALBUM_PAGE_SIZE}.`,
  })
  limit: number = DEFAULT_ALBUM_PAGE_SIZE;
}
