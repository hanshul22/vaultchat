import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Conversation } from '../conversations/entities/conversation.entity';
import { ConversationMember } from '../conversations/entities/conversation-member.entity';
import { Message } from '../messages/entities/message.entity';
import { MessageMedia } from '../messages/entities/message-media.entity';
import { Media } from '../media/entities/media.entity';
import { User } from '../users/entities/user.entity';

import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUser(id: string): User {
  return { id, email: `${id}@test.com`, fullName: `User ${id}` } as User;
}

function makeConversation(id: string, isGroup = false): Conversation {
  return {
    id,
    name: isGroup ? 'Group' : null,
    isGroup,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    members: [],
    messages: [],
  } as unknown as Conversation;
}

function makeMember(conversationId: string, userId: string): ConversationMember {
  return {
    conversationId,
    userId,
    lastReadMessageId: null,
    joinedAt: new Date(),
    user: makeUser(userId),
  } as unknown as ConversationMember;
}

function makeMedia(id: string, ownerId: string): Media {
  return {
    id,
    ownerId,
    url: `https://example.com/${id}`,
    mimeType: 'image/jpeg',
    sizeBytes: '1024',
    width: 100,
    height: 100,
    durationSeconds: null,
  } as unknown as Media;
}

function makeMessage(id: string, conversationId: string, senderId: string): Message {
  return {
    id,
    conversationId,
    senderId,
    body: 'Hello',
    createdAt: new Date('2024-01-02'),
    sender: makeUser(senderId),
    messageMedia: [],
  } as unknown as Message;
}

// ── Mock factory ──────────────────────────────────────────────────────────────

 
function mockRepo() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatService', () => {
  let service: ChatService;

  const conversationRepo = mockRepo();
  const memberRepo = mockRepo();
  const messageRepo = mockRepo();
  const messageMediaRepo = mockRepo();
  const mediaRepo = mockRepo();
  const userRepo = mockRepo();

  // DataSource mock — the transaction callback receives a manager that mirrors
  // the individual repo mocks for simplicity.
  const dataSourceMock = {
    transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(Conversation), useValue: conversationRepo },
        { provide: getRepositoryToken(ConversationMember), useValue: memberRepo },
        { provide: getRepositoryToken(Message), useValue: messageRepo },
        { provide: getRepositoryToken(MessageMedia), useValue: messageMediaRepo },
        { provide: getRepositoryToken(Media), useValue: mediaRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  // ── createConversation ──────────────────────────────────────────────────────

  describe('createConversation — 1:1', () => {
    const currentUserId = 'user-a';
    const otherUserId = 'user-b';

    const dto: CreateConversationDto = {
      participantIds: [otherUserId],
      isGroup: false,
    };

    it('creates a new 1:1 conversation when none exists', async () => {
      userRepo.find.mockResolvedValue([makeUser(currentUserId), makeUser(otherUserId)]);

      // No existing 1:1 — findExistingOneToOne returns null via QB.
      const qbMock = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      conversationRepo.createQueryBuilder.mockReturnValue(qbMock);

      const newConv = makeConversation('conv-1');
      newConv.members = [makeMember('conv-1', currentUserId), makeMember('conv-1', otherUserId)];

      dataSourceMock.transaction.mockImplementation(
        async (cb: (m: unknown) => Promise<Conversation>) => {
          const manager = {
            create: jest
              .fn()
              .mockImplementation((_entity: unknown, data: Partial<Conversation>) => data),
            save: jest.fn().mockResolvedValue({ id: 'conv-1' }),
          };
          return cb(manager);
        },
      );

      conversationRepo.findOne.mockResolvedValue(newConv);

      const result = await service.createConversation(currentUserId, dto);

      expect(result.id).toBe('conv-1');
      expect(result.isGroup).toBe(false);
      expect(result.memberCount).toBe(2);
    });

    it('returns existing 1:1 conversation instead of creating a duplicate', async () => {
      userRepo.find.mockResolvedValue([makeUser(currentUserId), makeUser(otherUserId)]);

      const existingConv = makeConversation('conv-existing');
      existingConv.members = [
        makeMember('conv-existing', currentUserId),
        makeMember('conv-existing', otherUserId),
      ];

      const qbMock = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingConv),
      };
      conversationRepo.createQueryBuilder.mockReturnValue(qbMock);

      const result = await service.createConversation(currentUserId, dto);

      expect(result.id).toBe('conv-existing');
      // Transaction should NOT have been called.
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
    });

    it('rejects when participantIds is empty (0 others → only 1 total participant)', async () => {
      const badDto: CreateConversationDto = { participantIds: [], isGroup: false };
      // participantIds has ArrayMinSize(1) so validation would catch it, but
      // the service also enforces the 2-participant rule.
      // We bypass DTO validation here and test the service guard directly.
      // After dedup: set = {currentUserId} → length 1, not 2.
      await expect(service.createConversation(currentUserId, badDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when more than 1 other participant is supplied for a 1:1', async () => {
      const badDto: CreateConversationDto = {
        participantIds: ['user-b', 'user-c'],
        isGroup: false,
      };
      userRepo.find.mockResolvedValue([
        makeUser(currentUserId),
        makeUser('user-b'),
        makeUser('user-c'),
      ]);
      await expect(service.createConversation(currentUserId, badDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when a participant user does not exist', async () => {
      userRepo.find.mockResolvedValue([makeUser(currentUserId)]); // otherUserId missing
      await expect(service.createConversation(currentUserId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createConversation — group', () => {
    const currentUserId = 'user-a';

    it('rejects group with fewer than 3 total participants', async () => {
      const dto: CreateConversationDto = {
        participantIds: ['user-b'],
        isGroup: true,
        name: 'My Group',
      };
      userRepo.find.mockResolvedValue([makeUser(currentUserId), makeUser('user-b')]);
      await expect(service.createConversation(currentUserId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects group without a name', async () => {
      const dto: CreateConversationDto = {
        participantIds: ['user-b', 'user-c'],
        isGroup: true,
        // name intentionally omitted
      };
      userRepo.find.mockResolvedValue([
        makeUser(currentUserId),
        makeUser('user-b'),
        makeUser('user-c'),
      ]);
      await expect(service.createConversation(currentUserId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── sendMessage ─────────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    const currentUserId = 'user-a';
    const conversationId = 'conv-1';

    beforeEach(() => {
      // Default: user is a member.
      conversationRepo.findOne.mockResolvedValue(makeConversation(conversationId));
      memberRepo.findOne.mockResolvedValue(makeMember(conversationId, currentUserId));
    });

    it('sends a text-only message', async () => {
      const dto: SendMessageDto = { body: 'Hello world', mediaIds: [] };

      const savedMsg = makeMessage('msg-1', conversationId, currentUserId);

      dataSourceMock.transaction.mockImplementation(
        async (cb: (m: unknown) => Promise<Message>) => {
          const manager = {
            create: jest
              .fn()
              .mockImplementation((_entity: unknown, data: Partial<Message>) => data),
            save: jest.fn().mockResolvedValue(savedMsg),
          };
          return cb(manager);
        },
      );

      messageRepo.findOne.mockResolvedValue(savedMsg);

      const result = await service.sendMessage(currentUserId, conversationId, dto);

      expect(result.id).toBe('msg-1');
      expect(result.body).toBe('Hello');
      expect(result.media).toHaveLength(0);
    });

    it('sends a message with a media attachment owned by the sender', async () => {
      const mediaId = 'media-1';
      const dto: SendMessageDto = { body: 'Check this out', mediaIds: [mediaId] };

      const media = makeMedia(mediaId, currentUserId);
      mediaRepo.find.mockResolvedValue([media]);

      const savedMsg = makeMessage('msg-2', conversationId, currentUserId);
      const msgMedia: MessageMedia = {
        messageId: 'msg-2',
        mediaId,
        orderIndex: 0,
        attachedAt: new Date(),
        message: savedMsg,
        media,
      } as unknown as MessageMedia;
      savedMsg.messageMedia = [msgMedia];

      dataSourceMock.transaction.mockImplementation(
        async (cb: (m: unknown) => Promise<Message>) => {
          const manager = {
            create: jest.fn().mockImplementation((_entity: unknown, data: unknown) => data),
            save: jest.fn().mockResolvedValue(savedMsg),
          };
          return cb(manager);
        },
      );

      messageRepo.findOne.mockResolvedValue(savedMsg);

      const result = await service.sendMessage(currentUserId, conversationId, dto);

      expect(result.media).toHaveLength(1);
      expect(result.media[0].id).toBe(mediaId);
    });

    it('rejects media not owned by the sender', async () => {
      const mediaId = 'media-owned-by-other';
      const dto: SendMessageDto = { body: 'Sneaky', mediaIds: [mediaId] };

      const media = makeMedia(mediaId, 'other-user');
      mediaRepo.find.mockResolvedValue([media]);

      await expect(service.sendMessage(currentUserId, conversationId, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects when body is empty and no media provided', async () => {
      const dto: SendMessageDto = { body: '   ', mediaIds: [] };
      await expect(service.sendMessage(currentUserId, conversationId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when the user is not a member of the conversation', async () => {
      memberRepo.findOne.mockResolvedValue(null); // not a member

      const dto: SendMessageDto = { body: 'Hello', mediaIds: [] };
      await expect(service.sendMessage(currentUserId, conversationId, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects when referenced media does not exist', async () => {
      const dto: SendMessageDto = { body: 'Hello', mediaIds: ['nonexistent-media'] };
      mediaRepo.find.mockResolvedValue([]); // nothing found

      await expect(service.sendMessage(currentUserId, conversationId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
