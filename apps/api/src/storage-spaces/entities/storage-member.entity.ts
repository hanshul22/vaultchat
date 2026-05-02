import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { StorageSpace } from './storage-space.entity';

// Owner is intentionally NOT a value here. A space's owner is tracked
// exclusively on `storage_spaces.owner_id`; StorageMember rows are for
// invited EDITOR and VIEWER collaborators only (PRD §9, UserFlow.md §12).
export enum StorageMemberRole {
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

// Supports "what spaces am I a member of?" lookups on the user side.
@Index('idx_storage_member_user', ['userId'])
@Entity({ name: 'storage_members' })
export class StorageMember {
  // Composite primary key (space_id, user_id). A user can be a member of
  // a given space at most once, enforced by the PK itself.
  @PrimaryColumn({ name: 'space_id', type: 'uuid' })
  spaceId!: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => StorageSpace, (space) => space.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'space_id' })
  storageSpace!: StorageSpace;

  @ManyToOne(() => User, (user) => user.storageMemberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    type: 'enum',
    enum: StorageMemberRole,
    enumName: 'storage_member_role',
  })
  role!: StorageMemberRole;

  @CreateDateColumn({ name: 'added_at', type: 'timestamptz' })
  addedAt!: Date;
}
