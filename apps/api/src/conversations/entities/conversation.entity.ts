// Both 1:1 and group conversations live in this table — they're
// distinguished only by `is_group`. All participants are equal; there is
// deliberately no owner FK (PRD §7). Deduping 1:1 pairs on creation is
// an application-layer concern handled at the service level (PRD §7.1).
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ConversationMember } from './conversation-member.entity';
import { Message } from '../../messages/entities/message.entity';

@Entity({ name: 'conversations' })
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // NULL for 1:1 conversations (UI derives a title from the other
  // participant); SET for group conversations.
  @Column({ type: 'varchar', length: 120, nullable: true })
  name!: string | null;

  // No default — the app layer always sets this explicitly so we never
  // end up with an ambiguous row. A missing value is a bug we want to
  // surface via NOT NULL violation, not silently coerce to false.
  @Column({ name: 'is_group', type: 'boolean' })
  isGroup!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => ConversationMember, (member) => member.conversation)
  members!: ConversationMember[];

  @OneToMany(() => Message, (message) => message.conversation)
  messages!: Message[];
}
