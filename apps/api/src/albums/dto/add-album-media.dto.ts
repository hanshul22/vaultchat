import { IsUUID } from 'class-validator';

/**
 * Body for POST /api/albums/:id/media.
 *
 * The service verifies that the referenced media item is owned by the
 * requesting user before inserting the join row.
 */
export class AddAlbumMediaDto {
  @IsUUID('4', { message: 'mediaId must be a valid UUID.' })
  mediaId!: string;
}
