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
import { Media } from '../../media/entities/media.entity';
import { User } from '../../users/entities/user.entity';
import { StorageMember } from './storage-member.entity';

@Entity({ name: 'storage_spaces' })
export class StorageSpace {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Owner is identified ONLY by this column — there is no "owner" role in
  // StorageMember. Deleting the owning user cascades the space away with
  // them (PRD §9, UserFlow.md §12).
  @Index()
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @ManyToOne(() => User, (user) => user.ownedStorageSpaces, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'owner_id' })
  owner!: User;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => StorageMember, (member) => member.storageSpace)
  members!: StorageMember[];

  @OneToMany(() => Media, (media) => media.storageSpace)
  media!: Media[];
}
