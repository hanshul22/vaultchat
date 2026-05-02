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
import { Conversation } from './conversation.entity';

// Supports "what conversations is this user in?" lookups driving the
// chat list and profile pages.
@Index('idx_conversation_member_user', ['userId'])
@Entity({ name: 'conversation_members' })
export class ConversationMember {
  // Composite primary key (conversation_id, user_id). A user can join
  // a given conversation at most once, enforced by the PK itself.
  @PrimaryColumn({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: Conversation;

  @ManyToOne(() => User, (user) => user.conversationMemberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  // Plain column, NOT a TypeORM relation — same pattern as
  // `Album.coverMediaId`. Declaring an FK to Message would introduce a
  // Conversation ↔ Message ↔ ConversationMember cycle with no benefit;
  // the app layer resolves this ID to a Message at read time.
  @Column({ name: 'last_read_message_id', type: 'uuid', nullable: true })
  lastReadMessageId!: string | null;

  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' })
  joinedAt!: Date;
}
