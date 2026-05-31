import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AlbumMedia } from '../../albums/entities/album-media.entity';
import { CloudinaryAccount } from '../../cloudinary-accounts/entities/cloudinary-account.entity';
import { MessageMedia } from '../../messages/entities/message-media.entity';
import { StorageSpace } from '../../storage-spaces/entities/storage-space.entity';
import { User } from '../../users/entities/user.entity';

// Composite index for gallery listing (PRD §10):
//   "media (owner_id, created_at DESC)"
@Index('idx_media_owner_created_at', ['ownerId', 'createdAt'])
// Composite index for listing media inside a shared space,
// newest-first (PRD §9, §10).
@Index('idx_media_space_created_at', ['storageSpaceId', 'createdAt'])
@Entity({ name: 'media' })
export class Media {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Owner (uploader). Cascading delete: if the user is hard-deleted, the
  // metadata row goes too. Cloudinary files themselves are NEVER deleted
  // by us (UserFlow.md §16 — they live in the user's own Cloudinary).
  @Index()
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @ManyToOne(() => User, (user) => user.media, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner!: User;

  // Which of the user's Cloudinary accounts stored this file.
  // RESTRICT on delete: the DB refuses to drop a CloudinaryAccount row
  // that still has media referencing it. The app layer handles the
  // "force delete with orphaning" flow (StorageModel.md §7).
  @Index()
  @Column({ name: 'cloudinary_account_id', type: 'uuid' })
  cloudinaryAccountId!: string;

  @ManyToOne(() => CloudinaryAccount, (account) => account.media, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'cloudinary_account_id' })
  cloudinaryAccount!: CloudinaryAccount;

  // Nullable — set only when the media lives inside a shared space.
  // Space-level permissions then govern access alongside ownership
  // (PRD §9). SET NULL on space delete so media survives and reverts
  // to owner-only access.
  @Index()
  @Column({ name: 'storage_space_id', type: 'uuid', nullable: true })
  storageSpaceId!: string | null;

  @ManyToOne(() => StorageSpace, (space) => space.media, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'storage_space_id' })
  storageSpace!: StorageSpace | null;

  // Cloudinary public_id — needed to build URLs and call the destroy API.
  @Column({ name: 'cloudinary_public_id', type: 'varchar', length: 255 })
  cloudinaryPublicId!: string;

  // Cached canonical delivery URL.
  @Column({ type: 'text' })
  url!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType!: string;

  // BIGINT because videos can exceed 2 GB. Mapped to JS string.
  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: string;

  @Column({ type: 'integer', nullable: true })
  width!: number | null;

  @Column({ type: 'integer', nullable: true })
  height!: number | null;

  // Videos only. Using numeric(10,3) = up to ~99,999,999.999 seconds,
  // stored with millisecond precision, mapped to JS string.
  @Column({
    name: 'duration_seconds',
    type: 'numeric',
    precision: 10,
    scale: 3,
    nullable: true,
  })
  durationSeconds!: string | null;

  // Set true when the owning CloudinaryAccount is force-removed with files
  // still inside (StorageModel.md §7). Row survives as a tombstone so the
  // UI can show "N items unreachable" banners.
  @Column({ name: 'is_orphaned', type: 'boolean', default: false })
  isOrphaned!: boolean;

  /**
   * True when this media item was assembled from multiple sequential chunks
   * (totalParts > 1). False for single-part direct uploads.
   */
  @Column({ name: 'is_multipart', type: 'boolean', default: false })
  isMultipart!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => AlbumMedia, (albumMedia) => albumMedia.media)
  albumMedia!: AlbumMedia[];

  @OneToMany(() => MessageMedia, (messageMedia) => messageMedia.media)
  messageMedia!: MessageMedia[];
}
