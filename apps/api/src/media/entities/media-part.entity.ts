import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Stores metadata for a single chunk of a multipart upload.
 *
 * When a client splits a large video into chunks and uploads them
 * sequentially, each chunk lands here. On the final chunk the service
 * assembles the logical Media row and marks it isMultipart = true.
 *
 * Rows are cleaned up (deleted) once the Media row is committed, or when
 * a chunk upload fails and the partial upload is rolled back.
 */
@Index('idx_media_part_media_id', ['mediaId'])
@Entity({ name: 'media_parts' })
export class MediaPart {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Client-generated UUID that ties all chunks of one logical upload together.
   * Matches the `mediaId` field sent in each chunk's FormData.
   */
  @Index()
  @Column({ name: 'media_id', type: 'uuid' })
  mediaId!: string;

  /** 0-based index of this chunk within the logical file. */
  @Column({ name: 'part_index', type: 'integer' })
  partIndex!: number;

  /** Total number of chunks declared by the client for this logical file. */
  @Column({ name: 'total_parts', type: 'integer' })
  totalParts!: number;

  /** Cloudinary public_id of this chunk's asset. */
  @Column({ name: 'cloudinary_public_id', type: 'varchar', length: 255 })
  cloudinaryPublicId!: string;

  /** Cloudinary cloud_name used for this chunk (needed for cleanup). */
  @Column({ name: 'cloud_name', type: 'varchar', length: 100 })
  cloudName!: string;

  /** Byte size of this chunk. */
  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: string;

  /** UUID of the Cloudinary account that received this chunk. */
  @Column({ name: 'cloudinary_account_id', type: 'uuid' })
  cloudinaryAccountId!: string;

  /** MIME type of this chunk (same as the logical file). */
  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
