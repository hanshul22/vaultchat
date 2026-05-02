import {
  Check,
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
import { Media } from '../../media/entities/media.entity';

export enum CloudinaryAccountRole {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
}

// Partial unique indexes enforce the StorageModel.md §6 rules:
//   1. Exactly one active Primary per user.
//   2. Each Secondary slot (1 or 2) is unique per user when active.
// The `where` clauses use double-quoted column names because Postgres
// treats unquoted identifiers as lowercase; these are raw SQL fragments.
@Index('uq_user_active_primary', ['userId'], {
  unique: true,
  where: `"role" = 'primary' AND "is_active" = true`,
})
@Index('uq_user_active_secondary_slot', ['userId', 'secondaryOrder'], {
  unique: true,
  where: `"role" = 'secondary' AND "is_active" = true`,
})
// CHECK constraint: role ↔ secondary_order must stay consistent.
// Primary → secondary_order MUST be NULL.
// Secondary → secondary_order MUST be 1 or 2.
@Check(
  'chk_role_secondary_order_consistency',
  `(role = 'primary' AND secondary_order IS NULL)
   OR (role = 'secondary' AND secondary_order IN (1, 2))`,
)
@Entity({ name: 'cloudinary_accounts' })
export class CloudinaryAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Explicit FK column so we can reference it by name in the composite
  // indexes above (TypeORM requires the JS property name in @Index arrays).
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.cloudinaryAccounts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'cloud_name', type: 'varchar', length: 100 })
  cloudName!: string;

  @Column({ name: 'api_key', type: 'varchar', length: 100 })
  apiKey!: string;

  // AES-256-GCM ciphertext + IV + auth tag, encoded as a single string.
  // Encoding format is decided in Phase 5; this column just holds the blob.
  @Column({ name: 'api_secret_encrypted', type: 'text' })
  apiSecretEncrypted!: string;

  @Column({
    type: 'enum',
    enum: CloudinaryAccountRole,
    enumName: 'cloudinary_account_role',
  })
  role!: CloudinaryAccountRole;

  // 1 or 2 for secondaries; NULL for primary.
  // Enforced by the CHECK constraint above.
  @Column({ name: 'secondary_order', type: 'smallint', nullable: true })
  secondaryOrder!: number | null;

  // Storage tracked in BYTES via bigint (StorageModel.md §6).
  // TypeORM maps bigint to a JS string to avoid 53-bit precision loss.
  // Application code must parse with BigInt() or Number() as appropriate.
  @Column({
    name: 'storage_used_bytes',
    type: 'bigint',
    default: 0,
  })
  storageUsedBytes!: string;

  @Column({
    name: 'storage_limit_bytes',
    type: 'bigint',
  })
  storageLimitBytes!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({
    name: 'last_reconciled_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastReconciledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Media, (media) => media.cloudinaryAccount)
  media!: Media[];
}
