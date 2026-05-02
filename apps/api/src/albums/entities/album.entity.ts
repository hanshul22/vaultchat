import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AlbumMedia } from './album-media.entity';

// Composite index for album listing (PRD §10):
//   "albums (owner_id, created_at DESC)"
@Index('idx_album_owner_created_at', ['ownerId', 'createdAt'])
@Entity({ name: 'albums' })
export class Album {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Owner. Cascading delete: when a user is hard-deleted, their albums go
  // with them (the contained Media rows cascade separately from User).
  @Index()
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @ManyToOne(() => User, (user) => user.albums, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner!: User;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  // Cover image is a plain column, NOT a TypeORM relation (PRD §8).
  // The reference is resolved at query time so we can freely change the
  // cover without FK cascade concerns and tolerate a soft-deleted cover.
  @Column({ name: 'cover_media_id', type: 'uuid', nullable: true })
  coverMediaId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => AlbumMedia, (albumMedia) => albumMedia.album)
  albumMedia!: AlbumMedia[];
}
