/**
 * Frontend model for a single media item, typed against the fields returned
 * by GET /api/v1/media (MediaResponseDto in Phase 7).
 *
 * Fields that do not exist in the backend response (originalFilename,
 * isMultipart, partCount, hlsUrl, playbackUrl) are intentionally absent —
 * they are not returned by the current API and will be added when the backend
 * exposes them.
 */
export interface MediaItem {
  /** UUID primary key. */
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

  /**
   * Canonical delivery URL stored at upload time.
   * Used as the base for deriving thumbnail transform URLs.
   */
  url: string;

  /** Full MIME type, e.g. "image/jpeg" or "video/mp4". */
  mimeType: string;

  /**
   * File size in bytes, serialised as a string to preserve BIGINT precision
   * across the JSON boundary.
   */
  sizeBytes: string;

  /** Pixel width, or null when not available (e.g. audio). */
  width: number | null;

  /** Pixel height, or null when not available. */
  height: number | null;

  /**
   * Video/audio duration in seconds with millisecond precision, serialised as
   * a string. Null for images.
   */
  durationSeconds: string | null;

  /** ISO-8601 timestamp of when the item was uploaded. */
  createdAt: string;
}

/** Coarse media family derived from the MIME type. */
export type MediaFamily = 'image' | 'video' | 'other';

/** Returns the coarse media family for a MIME type string. */
export function mediaFamily(mimeType: string): MediaFamily {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'other';
}

/**
 * Derives a Cloudinary HLS streaming URL from a stored video delivery URL.
 *
 * Cloudinary serves HLS manifests by replacing the file extension with `.m3u8`
 * and adding `sp_auto` (streaming profile) to the transformation segment.
 *
 * Example:
 *   Input:  https://res.cloudinary.com/demo/video/upload/v1/vaultchat/user/abc.mp4
 *   Output: https://res.cloudinary.com/demo/video/upload/sp_auto/v1/vaultchat/user/abc.m3u8
 *
 * Returns null when the URL does not match the expected Cloudinary video pattern.
 *
 * @param url  The canonical video delivery URL stored in the media row.
 */
export function cloudinaryHlsUrl(url: string): string | null {
  if (!url.includes('/video/upload/')) return null;

  return url.replace(/\/video\/upload\//, '/video/upload/sp_auto/').replace(/\.[^./?#]+$/, '.m3u8');
}

/**
 * Derives a Cloudinary thumbnail URL from a stored delivery URL by injecting
 * a transformation segment before the version/public_id portion.
 *
 * Cloudinary delivery URLs follow the pattern:
 *   https://res.cloudinary.com/<cloud>/image/upload/<version>/<public_id>.<ext>
 *
 * We insert the transformation string after `/upload/` so the CDN serves a
 * resized, auto-formatted thumbnail instead of the full-resolution asset.
 *
 * @param url       The canonical URL stored in the media row.
 * @param transform Cloudinary transformation string, e.g. "w_400,h_400,c_fill,q_auto,f_auto".
 */
export function cloudinaryThumbUrl(
  url: string,
  transform = 'w_400,h_400,c_fill,q_auto,f_auto',
): string {
  return url.replace(/\/(image|video)\/upload\//, `/$1/upload/${transform}/`);
}
