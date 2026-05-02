// Chat-attachment analogue of AlbumMedia: a composite-keyed join between
// a Message and each Media it carries. Bidirectional relations on both
// sides also enable the reverse "which messages reference this media?"
// query if we ever need it (e.g. for media deletion impact analysis).
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Media } from '../../media/entities/media.entity';
import { Message } from './message.entity';

@Entity({ name: 'message_media' })
export class MessageMedia {
  // Composite primary key (message_id, media_id). The left side of the
  // PK also indexes "attachments for this message" lookups; reverse
  // lookups by media_id are rare enough to skip a secondary index in
  // Phase 2 and revisit only if traffic demands it.
  @PrimaryColumn({ name: 'message_id', type: 'uuid' })
  messageId!: string;

  @PrimaryColumn({ name: 'media_id', type: 'uuid' })
  mediaId!: string;

  @ManyToOne(() => Message, (message) => message.messageMedia, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'message_id' })
  message!: Message;

  @ManyToOne(() => Media, (media) => media.messageMedia, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'media_id' })
  media!: Media;

  // Preserves the attach-order the sender chose in the composer UI.
  @Column({ name: 'order_index', type: 'integer', nullable: true })
  orderIndex!: number | null;

  @CreateDateColumn({ name: 'attached_at', type: 'timestamptz' })
  attachedAt!: Date;
}
