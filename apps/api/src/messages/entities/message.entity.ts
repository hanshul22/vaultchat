import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Conversation } from '../../conversations/entities/conversation.entity';
import { User } from '../../users/entities/user.entity';
import { MessageMedia } from './message-media.entity';

// Key index for chat history (PRD §10):
//   "messages (conversation_id, created_at DESC)"
// Powers the cursor-paginated load of a conversation's messages.
@Index('idx_message_conversation_created_at', ['conversationId', 'createdAt'])
@Entity({ name: 'messages' })
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: Conversation;

  @Index()
  @Column({ name: 'sender_id', type: 'uuid' })
  senderId!: string;

  // RESTRICT — messages outlive user soft-deletion. When a user is hard
  // deleted after the UserFlow.md §16 grace window, the app layer must
  // reassign or delete their messages first; the DB refuses otherwise.
  @ManyToOne(() => User, (user) => user.messages, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sender_id' })
  sender!: User;

  // 10,000 char cap per PRD §7.2. Postgres stores varchar/text the same
  // on disk; the length here is the enforcement mechanism.
  @Column({ type: 'varchar', length: 10000 })
  body!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => MessageMedia, (messageMedia) => messageMedia.message)
  messageMedia!: MessageMedia[];
}
