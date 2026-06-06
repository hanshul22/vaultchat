import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { Conversation } from '../conversations/entities/conversation.entity';
import { ConversationMember } from '../conversations/entities/conversation-member.entity';
import { Message } from '../messages/entities/message.entity';
import { MessageMedia } from '../messages/entities/message-media.entity';
import { Media } from '../media/entities/media.entity';
import { User } from '../users/entities/user.entity';

import { CreateConversationDto } from './dto/create-conversation.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  ChatConversationResponseDto,
  ChatLastMessageSummaryDto,
  ChatMediaSummaryDto,
  ChatUserSummaryDto,
} from './dto/chat-conversation-response.dto';
import {
  ChatMessageListResponseDto,
  ChatMessageResponseDto,
} from './dto/chat-message-response.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,

    @InjectRepository(ConversationMember)
    private readonly memberRepo: Repository<ConversationMember>,

    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,

    @InjectRepository(Media)
    private readonly mediaRepo: Repository<Media>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly dataSource: DataSource,
  ) {}

  // ── Create conversation ───────────────────────────────────────────────────

  async createConversation(
    currentUserId: string,
    dto: CreateConversationDto,
  ): Promise<ChatConversationResponseDto> {
    // Build the full participant set (deduplicated, caller always included).
    const participantSet = new Set<string>([currentUserId, ...dto.participantIds]);
    const participantIds = [...participantSet];

    // Validate participant counts.
    if (!dto.isGroup) {
      if (participantIds.length !== 2) {
        throw new BadRequestException(
          '1:1 conversations require exactly 2 participants (you + one other user).',
        );
      }
    } else {
      if (participantIds.length < 3) {
        throw new BadRequestException('Group conversations require at least 3 participants.');
      }
      if (!dto.name || dto.name.trim().length === 0) {
        throw new BadRequestException('Group conversations require a name.');
      }
    }

    // Validate all participant users exist.
    const users = await this.userRepo.find({ where: { id: In(participantIds) } });
    if (users.length !== participantIds.length) {
      const foundIds = new Set(users.map((u) => u.id));
      const missing = participantIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(`Users not found: ${missing.join(', ')}`);
    }

    // Dedupe 1:1 conversations at the service layer (PRD §7.1).
    if (!dto.isGroup) {
      const existing = await this.findExistingOneToOne(participantIds[0], participantIds[1]);
      if (existing) {
        return this.toConversationResponse(existing, currentUserId);
      }
    }

    // Create conversation + members transactionally.
    const conversation = await this.dataSource.transaction(async (manager) => {
      const conv = manager.create(Conversation, {
        name: dto.isGroup ? (dto.name ?? null) : null,
        isGroup: dto.isGroup,
      });
      const savedConv = await manager.save(Conversation, conv);

      const memberEntities = participantIds.map((userId) =>
        manager.create(ConversationMember, {
          conversationId: savedConv.id,
          userId,
          lastReadMessageId: null,
        }),
      );
      await manager.save(ConversationMember, memberEntities);

      return savedConv;
    });

    // Reload with members for the response.
    const loaded = await this.conversationRepo.findOne({
      where: { id: conversation.id },
      relations: ['members', 'members.user'],
    });
    if (!loaded) throw new NotFoundException('Conversation not found after creation.');

    return this.toConversationResponse(loaded, currentUserId);
  }

  // ── List conversations ────────────────────────────────────────────────────

  async listConversations(
    currentUserId: string,
    query: ListConversationsQueryDto,
  ): Promise<ChatConversationResponseDto[]> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    // Fetch conversation IDs the user belongs to.
    const memberRows = await this.memberRepo.find({
      where: { userId: currentUserId },
      select: ['conversationId'],
    });

    if (memberRows.length === 0) return [];

    const conversationIds = memberRows.map((m) => m.conversationId);

    // Load conversations with members.
    const conversations = await this.conversationRepo.find({
      where: { id: In(conversationIds) },
      relations: ['members', 'members.user'],
    });

    if (conversations.length === 0) return [];

    // Fetch the latest message per conversation using a subquery.
    // We get the most recent message for each conversation in one query.
    const latestMessages = await this.messageRepo
      .createQueryBuilder('msg')
      .innerJoin(
        (qb) =>
          qb
            .select('m2.conversation_id', 'cid')
            .addSelect('MAX(m2.created_at)', 'maxCreatedAt')
            .from('messages', 'm2')
            .where('m2.conversation_id IN (:...ids)', { ids: conversationIds })
            .groupBy('m2.conversation_id'),
        'latest',
        'msg.conversation_id = latest.cid AND msg.created_at = latest."maxCreatedAt"',
      )
      .where('msg.conversation_id IN (:...ids)', { ids: conversationIds })
      .getMany();

    const latestMessageMap = new Map<string, Message>();
    for (const msg of latestMessages) {
      // In case of ties (same timestamp), keep the first one found.
      if (!latestMessageMap.has(msg.conversationId)) {
        latestMessageMap.set(msg.conversationId, msg);
      }
    }

    // Sort conversations by latest activity: latest message createdAt, else conversation.createdAt.
    conversations.sort((a, b) => {
      const aTime = latestMessageMap.get(a.id)?.createdAt ?? a.createdAt;
      const bTime = latestMessageMap.get(b.id)?.createdAt ?? b.createdAt;
      return bTime.getTime() - aTime.getTime();
    });

    // Apply pagination after sorting.
    const paginated = conversations.slice(offset, offset + limit);

    // Compute unread counts for the current user.
    // unreadCount = number of messages in the conversation created after the
    // last_read_message_id's createdAt (or all messages if never read).
    const currentUserMemberMap = new Map<string, ConversationMember>();
    for (const conv of paginated) {
      const myMembership = conv.members.find((m) => m.userId === currentUserId);
      if (myMembership) currentUserMemberMap.set(conv.id, myMembership);
    }

    const unreadCountMap = await this.computeUnreadCounts(
      paginated.map((c) => c.id),
      currentUserId,
      currentUserMemberMap,
    );

    return paginated.map((conv) => {
      const lastMsg = latestMessageMap.get(conv.id) ?? null;
      const unreadCount = unreadCountMap.get(conv.id) ?? 0;
      return this.toConversationResponseRaw(conv, lastMsg, unreadCount);
    });
  }

  // ── List messages ─────────────────────────────────────────────────────────

  async listMessages(
    currentUserId: string,
    conversationId: string,
    query: ListMessagesQueryDto,
  ): Promise<ChatMessageListResponseDto> {
    await this.assertMember(currentUserId, conversationId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const offset = (page - 1) * limit;

    const [messages, total] = await this.messageRepo.findAndCount({
      where: { conversationId },
      relations: ['sender', 'messageMedia', 'messageMedia.media'],
      order: { createdAt: 'ASC' },
      skip: offset,
      take: limit,
    });

    const items = messages.map((msg) => this.toMessageResponse(msg));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Send message ──────────────────────────────────────────────────────────

  async sendMessage(
    currentUserId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<ChatMessageResponseDto> {
    await this.assertMember(currentUserId, conversationId);

    const trimmedBody = dto.body.trim();
    const mediaIds = dto.mediaIds ?? [];

    // At least one of body or media must be present.
    if (trimmedBody.length === 0 && mediaIds.length === 0) {
      throw new BadRequestException('A message must have a body or at least one media attachment.');
    }

    // Validate media ownership.
    let mediaItems: Media[] = [];
    if (mediaIds.length > 0) {
      mediaItems = await this.mediaRepo.find({
        where: { id: In(mediaIds) },
      });

      if (mediaItems.length !== mediaIds.length) {
        const foundIds = new Set(mediaItems.map((m) => m.id));
        const missing = mediaIds.filter((id) => !foundIds.has(id));
        throw new NotFoundException(`Media not found: ${missing.join(', ')}`);
      }

      const notOwned = mediaItems.filter((m) => m.ownerId !== currentUserId);
      if (notOwned.length > 0) {
        throw new ForbiddenException(
          `You do not own the following media: ${notOwned.map((m) => m.id).join(', ')}`,
        );
      }
    }

    // Create message + message_media rows transactionally.
    const message = await this.dataSource.transaction(async (manager) => {
      const msg = manager.create(Message, {
        conversationId,
        senderId: currentUserId,
        body: trimmedBody,
      });
      const savedMsg = await manager.save(Message, msg);

      if (mediaItems.length > 0) {
        const attachments = mediaItems.map((media, index) =>
          manager.create(MessageMedia, {
            messageId: savedMsg.id,
            mediaId: media.id,
            orderIndex: index,
          }),
        );
        await manager.save(MessageMedia, attachments);
      }

      return savedMsg;
    });

    // Reload with relations for the response.
    const loaded = await this.messageRepo.findOne({
      where: { id: message.id },
      relations: ['sender', 'messageMedia', 'messageMedia.media'],
    });
    if (!loaded) throw new NotFoundException('Message not found after creation.');

    return this.toMessageResponse(loaded);
  }

  // ── Mark read ─────────────────────────────────────────────────────────────

  /**
   * Updates `conversation_members.last_read_message_id` for the given user.
   * Called by both the REST layer (future) and the WebSocket gateway.
   */
  async markRead(userId: string, conversationId: string, messageId: string): Promise<void> {
    await this.assertMember(userId, conversationId);

    // Verify the message exists in this conversation.
    const message = await this.messageRepo.findOne({
      where: { id: messageId, conversationId },
    });
    if (!message) {
      throw new NotFoundException('Message not found in this conversation.');
    }

    await this.memberRepo.update({ conversationId, userId }, { lastReadMessageId: messageId });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Throws ForbiddenException if the user is not a member of the conversation.
   * Throws NotFoundException if the conversation does not exist.
   */
  private async assertMember(userId: string, conversationId: string): Promise<void> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found.');

    const membership = await this.memberRepo.findOne({
      where: { conversationId, userId },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this conversation.');
    }
  }

  /**
   * Finds an existing 1:1 conversation between exactly two users.
   * Returns null if none exists.
   */
  private async findExistingOneToOne(
    userAId: string,
    userBId: string,
  ): Promise<Conversation | null> {
    // A 1:1 conversation has is_group = false and exactly 2 members:
    // both userA and userB. We find conversations where userA is a member,
    // then filter to those where userB is also a member and is_group = false.
    const result = await this.conversationRepo
      .createQueryBuilder('conv')
      .innerJoin('conv.members', 'ma', 'ma.user_id = :userA', { userA: userAId })
      .innerJoin('conv.members', 'mb', 'mb.user_id = :userB', { userB: userBId })
      .where('conv.isGroup = false')
      .leftJoinAndSelect('conv.members', 'allMembers')
      .leftJoinAndSelect('allMembers.user', 'memberUser')
      .getOne();

    if (!result) return null;

    // Verify it has exactly 2 members (no extra participants).
    if (result.members.length !== 2) return null;

    return result;
  }

  /**
   * Computes unread message counts for a set of conversations for the
   * current user. Uses last_read_message_id to find the cutoff.
   */
  private async computeUnreadCounts(
    conversationIds: string[],
    _currentUserId: string,
    memberMap: Map<string, ConversationMember>,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();

    if (conversationIds.length === 0) return result;

    // For each conversation, count messages after the last-read message.
    // We do this with a single query using CASE WHEN for efficiency.
    // For conversations where lastReadMessageId is null, count all messages.
    for (const convId of conversationIds) {
      const membership = memberMap.get(convId);
      const lastReadId = membership?.lastReadMessageId ?? null;

      if (lastReadId === null) {
        // Never read — count all messages not sent by the current user.
        const count = await this.messageRepo.count({
          where: { conversationId: convId },
        });
        result.set(convId, count);
      } else {
        // Find the createdAt of the last-read message.
        const lastReadMsg = await this.messageRepo.findOne({
          where: { id: lastReadId },
          select: ['createdAt'],
        });

        if (!lastReadMsg) {
          // lastReadMessageId references a deleted message — treat as unread all.
          const count = await this.messageRepo.count({
            where: { conversationId: convId },
          });
          result.set(convId, count);
        } else {
          const count = await this.messageRepo
            .createQueryBuilder('msg')
            .where('msg.conversationId = :convId', { convId })
            .andWhere('msg.createdAt > :cutoff', { cutoff: lastReadMsg.createdAt })
            .getCount();
          result.set(convId, count);
        }
      }
    }

    return result;
  }

  // ── Mappers ───────────────────────────────────────────────────────────────

  private toUserSummary(user: User): ChatUserSummaryDto {
    const dto = new ChatUserSummaryDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.fullName = user.fullName;
    return dto;
  }

  private toMediaSummary(mm: MessageMedia): ChatMediaSummaryDto {
    const dto = new ChatMediaSummaryDto();
    dto.id = mm.media.id;
    dto.url = mm.media.url;
    dto.mimeType = mm.media.mimeType;
    dto.sizeBytes = mm.media.sizeBytes;
    dto.width = mm.media.width;
    dto.height = mm.media.height;
    dto.durationSeconds = mm.media.durationSeconds;
    dto.orderIndex = mm.orderIndex;
    return dto;
  }

  private toMessageResponse(message: Message): ChatMessageResponseDto {
    const dto = new ChatMessageResponseDto();
    dto.id = message.id;
    dto.conversationId = message.conversationId;
    dto.body = message.body;
    dto.sender = this.toUserSummary(message.sender);
    dto.media = (message.messageMedia ?? [])
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
      .map((mm) => this.toMediaSummary(mm));
    dto.createdAt = message.createdAt;
    return dto;
  }

  /**
   * Maps a Conversation entity (with members + members.user loaded) plus
   * optional last message and unread count to the response DTO.
   */
  private toConversationResponseRaw(
    conv: Conversation,
    lastMsg: Message | null,
    unreadCount: number,
  ): ChatConversationResponseDto {
    const dto = new ChatConversationResponseDto();
    dto.id = conv.id;
    dto.name = conv.name;
    dto.isGroup = conv.isGroup;
    dto.createdAt = conv.createdAt;
    dto.updatedAt = conv.updatedAt;
    dto.memberCount = conv.members.length;
    dto.members = conv.members.map((m) => this.toUserSummary(m.user));

    if (lastMsg) {
      const summary = new ChatLastMessageSummaryDto();
      summary.id = lastMsg.id;
      summary.body = lastMsg.body;
      summary.senderId = lastMsg.senderId;
      summary.createdAt = lastMsg.createdAt;
      dto.lastMessage = summary;
    } else {
      dto.lastMessage = null;
    }

    dto.unreadCount = unreadCount;
    return dto;
  }

  /**
   * Convenience wrapper used when we have a freshly loaded Conversation
   * (e.g. after creation) and no last-message context yet.
   */
  private toConversationResponse(
    conv: Conversation,
    _currentUserId: string,
  ): ChatConversationResponseDto {
    return this.toConversationResponseRaw(conv, null, 0);
  }
}
