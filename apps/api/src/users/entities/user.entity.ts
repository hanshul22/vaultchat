import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Album } from '../../albums/entities/album.entity';
import { CloudinaryAccount } from '../../cloudinary-accounts/entities/cloudinary-account.entity';
import { ConversationMember } from '../../conversations/entities/conversation-member.entity';
import { Media } from '../../media/entities/media.entity';
import { Message } from '../../messages/entities/message.entity';
import { StorageMember } from '../../storage-spaces/entities/storage-member.entity';
import { StorageSpace } from '../../storage-spaces/entities/storage-space.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName!: string;

  // argon2 hash. Never returned from an API.
  // Exclusion from responses will be handled at the DTO layer in Phase 3.
  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  // Google OAuth linking. Nullable because linking is optional (PRD §3.3).
  // Partial unique index: uniqueness only applies when google_id IS NOT NULL.
  @Index({ unique: true, where: '"google_id" IS NOT NULL' })
  @Column({ name: 'google_id', type: 'varchar', length: 64, nullable: true })
  googleId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // Soft delete for USER_FLOW.md §16 — 30-day grace window.
  // TypeORM auto-excludes these from .find() unless { withDeleted: true }.
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => CloudinaryAccount, (account) => account.user)
  cloudinaryAccounts!: CloudinaryAccount[];

  @OneToMany(() => Media, (media) => media.owner)
  media!: Media[];

  @OneToMany(() => Album, (album) => album.owner)
  albums!: Album[];

  @OneToMany(() => StorageSpace, (space) => space.owner)
  ownedStorageSpaces!: StorageSpace[];

  @OneToMany(() => StorageMember, (member) => member.user)
  storageMemberships!: StorageMember[];

  @OneToMany(() => ConversationMember, (member) => member.user)
  conversationMemberships!: ConversationMember[];

  @OneToMany(() => Message, (message) => message.sender)
  messages!: Message[];
}
