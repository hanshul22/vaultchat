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
@Index(['email'], { unique: true })
@Index(['googleId'], { unique: true, where: '"google_id" IS NOT NULL' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'email', type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'google_id', type: 'varchar', length: 255, nullable: true })
  googleId!: string | null;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 255, nullable: true })
  refreshTokenHash!: string | null;

  @Column({ name: 'password_reset_token_hash', type: 'varchar', length: 255, nullable: true })
  passwordResetTokenHash!: string | null;

  @Column({ name: 'password_reset_token_expires_at', type: 'timestamptz', nullable: true })
  passwordResetTokenExpiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => CloudinaryAccount, (cloudinaryAccount) => cloudinaryAccount.user)
  cloudinaryAccounts!: CloudinaryAccount[];

  @OneToMany(() => Album, (album) => album.owner)
  albums!: Album[];

  @OneToMany(() => Media, (media) => media.owner)
  media!: Media[];

  @OneToMany(() => ConversationMember, (conversationMembership) => conversationMembership.user)
  conversationMemberships!: ConversationMember[];

  @OneToMany(() => Message, (message) => message.sender)
  messages!: Message[];

  @OneToMany(() => StorageSpace, (storageSpace) => storageSpace.owner)
  ownedStorageSpaces!: StorageSpace[];

  @OneToMany(() => StorageMember, (storageMembership) => storageMembership.user)
  storageMemberships!: StorageMember[];
}