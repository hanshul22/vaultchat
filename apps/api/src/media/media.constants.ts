import { CloudinaryResourceType } from '../common/cloudinary/cloudinary-uploader.service';

/**
 * Server-side MIME allowlist (PRD §6.1). The browser-declared MIME header is
 * never trusted on its own — the upload path also confirms the magic bytes
 * resolve to one of these types via `file-type`.
 */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
] as const;

/** Direct-upload signatures are intentionally short-lived (10 minutes). */
export const DIRECT_UPLOAD_SIGNATURE_TTL_SECONDS = 10 * 60;

/** Frontend chunk size contract for direct browser-to-Cloudinary uploads. */
export const DIRECT_UPLOAD_MAX_CHUNK_SIZE_BYTES = 20 * 1024 * 1024;

/** Folder prefix used for all per-user Cloudinary direct uploads. */
export const DIRECT_UPLOAD_FOLDER_ROOT = 'vaultchat';

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Fast membership test for the allowlist. */
export const isAllowedMimeType = (mime: string): mime is AllowedMimeType =>
  (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);

/**
 * Maps an allowed MIME type to the Cloudinary resource bucket used in the
 * upload/destroy URL. video/* → 'video', everything else in the allowlist
 * is an image.
 */
export const resourceTypeForMime = (mime: string): CloudinaryResourceType =>
  mime.startsWith('video/') ? 'video' : 'image';
