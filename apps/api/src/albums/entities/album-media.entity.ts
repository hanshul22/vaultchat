import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Media } from '../../media/entities/media.entity';
import { Album } from './album.entity';

// Composite index for "list items in this album by newest first" (PRD §10):
//   "album_media (album_id, added_at DESC)"
@Index('idx_album_media_album_added_at', ['albumId', 'addedAt'])
@Entity({ name: 'album_media' })
export class AlbumMedia {
  // Composite primary key (album_id, media_id). No surrogate id —
  // the pair itself uniquely identifies the join row (PRD §8, §10).
  @PrimaryColumn({ name: 'album_id', type: 'uuid' })
  albumId!: string;

  @PrimaryColumn({ name: 'media_id', type: 'uuid' })
  mediaId!: string;

  @ManyToOne(() => Album, (album) => album.albumMedia, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'album_id' })
  album!: Album;

  @ManyToOne(() => Media, (media) => media.albumMedia, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'media_id' })
  media!: Media;

  // Optional user-defined ordering within the album (PRD §8).
  @Column({ name: 'order_index', type: 'integer', nullable: true })
  orderIndex!: number | null;

  @CreateDateColumn({ name: 'added_at', type: 'timestamptz' })
  addedAt!: Date;
}
