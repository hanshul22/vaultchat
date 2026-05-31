import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';

import { ConversationMember } from '../conversations/entities/conversation-member.entity';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatPresenceService } from './presence/chat-presence.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSocket(userId?: string) {
  return {
    id: 'socket-test-1',
    data: userId ? { user: { id: userId, email: `${userId}@test.com`, jti: 'jti-1' } } : {},
    handshake: {
      auth: {},
      headers: {},
    },
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    to: jest.fn().mockReturnThis(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatGateway', () => {
  let gateway: ChatGateway;

  const chatServiceMock = {
    sendMessage: jest.fn(),
    markRead: jest.fn(),
  };

  const presenceServiceMock = {
    markSocketConnected: jest.fn().mockResolvedValue(undefined),
    markSocketDisconnected: jest.fn().mockResolvedValue(undefined),
    refreshPresence: jest.fn().mockResolvedValue(undefined),
    getUsersPresence: jest.fn().mockResolvedValue([]),
  };

  const memberRepoMock = {
    findOne: jest.fn(),
  };

  const jwtServiceMock = {
    verify: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn().mockReturnValue('test-secret'),
  };

  const redisMock = {
    get: jest.fn().mockResolvedValue(null),
  };

  const serverMock = {
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: ChatService, useValue: chatServiceMock },
        { provide: ChatPresenceService, useValue: presenceServiceMock },
        { provide: WsJwtGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: getRepositoryToken(ConversationMember), useValue: memberRepoMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: 'REDIS_CLIENT', useValue: redisMock },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);

    // Inject the server mock directly (normally set by @WebSocketServer decorator).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gateway as any).server = serverMock;
  });

  // ── handleConnection ──────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('disconnects a socket with no token', async () => {
      const client = makeSocket();
      await gateway.handleConnection(client as never);
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.emit).toHaveBeenCalledWith(
        'chat:error',
        expect.objectContaining({ message: expect.any(String) }),
      );
    });

    it('disconnects a socket with an invalid token', async () => {
      const client = makeSocket();
      client.handshake.auth = { token: 'bad-token' };
      jwtServiceMock.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      await gateway.handleConnection(client as never);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects a socket with a blacklisted token', async () => {
      const client = makeSocket();
      client.handshake.auth = { token: 'valid-token' };
      jwtServiceMock.verify.mockReturnValue({ sub: 'user-1', email: 'u@t.com', jti: 'jti-bl' });
      redisMock.get.mockResolvedValueOnce('1'); // blacklisted

      await gateway.handleConnection(client as never);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('attaches user data and marks presence for a valid token', async () => {
      const client = makeSocket();
      client.handshake.auth = { token: 'valid-token' };
      jwtServiceMock.verify.mockReturnValue({ sub: 'user-1', email: 'u@t.com', jti: 'jti-ok' });
      redisMock.get.mockResolvedValue(null); // not blacklisted

      await gateway.handleConnection(client as never);

      expect(client.data['user']).toMatchObject({ id: 'user-1', email: 'u@t.com' });
      expect(presenceServiceMock.markSocketConnected).toHaveBeenCalledWith(
        'user-1',
        'socket-test-1',
      );
    });
  });

  // ── handleDisconnect ──────────────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('marks socket disconnected for authenticated user', async () => {
      const client = makeSocket('user-1');
      await gateway.handleDisconnect(client as never);
      expect(presenceServiceMock.markSocketDisconnected).toHaveBeenCalledWith(
        'user-1',
        'socket-test-1',
      );
    });

    it('does nothing for unauthenticated socket', async () => {
      const client = makeSocket(); // no user data
      await gateway.handleDisconnect(client as never);
      expect(presenceServiceMock.markSocketDisconnected).not.toHaveBeenCalled();
    });
  });

  // ── handleJoinConversation ────────────────────────────────────────────────

  describe('handleJoinConversation', () => {
    it('joins the room when user is a member', async () => {
      const client = makeSocket('user-1');
      memberRepoMock.findOne.mockResolvedValue({ conversationId: 'conv-1', userId: 'user-1' });

      await gateway.handleJoinConversation(client as never, { conversationId: 'conv-1' });

      expect(client.join).toHaveBeenCalledWith('conversation:conv-1');
    });

    it('emits error and throws when user is not a member', async () => {
      const client = makeSocket('user-1');
      memberRepoMock.findOne.mockResolvedValue(null);

      await expect(
        gateway.handleJoinConversation(client as never, { conversationId: 'conv-1' }),
      ).rejects.toThrow(WsException);

      expect(client.emit).toHaveBeenCalledWith('chat:error', expect.any(Object));
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  // ── handleSendMessage ─────────────────────────────────────────────────────

  describe('handleSendMessage', () => {
    it('creates message and emits to room on success', async () => {
      const client = makeSocket('user-1');
      memberRepoMock.findOne.mockResolvedValue({ conversationId: 'conv-1', userId: 'user-1' });

      const fakeMessage = { id: 'msg-1', body: 'Hello', conversationId: 'conv-1' };
      chatServiceMock.sendMessage.mockResolvedValue(fakeMessage);

      await gateway.handleSendMessage(client as never, {
        conversationId: 'conv-1',
        body: 'Hello',
      });

      expect(chatServiceMock.sendMessage).toHaveBeenCalledWith(
        'user-1',
        'conv-1',
        expect.objectContaining({ body: 'Hello' }),
      );
      expect(serverMock.to).toHaveBeenCalledWith('conversation:conv-1');
    });

    it('emits chat:error when sendMessage throws', async () => {
      const client = makeSocket('user-1');
      memberRepoMock.findOne.mockResolvedValue({ conversationId: 'conv-1', userId: 'user-1' });
      chatServiceMock.sendMessage.mockRejectedValue(new Error('DB error'));

      await gateway.handleSendMessage(client as never, {
        conversationId: 'conv-1',
        body: 'Hello',
      });

      expect(client.emit).toHaveBeenCalledWith(
        'chat:error',
        expect.objectContaining({ message: 'DB error' }),
      );
    });
  });

  // ── handleMarkRead ────────────────────────────────────────────────────────

  describe('handleMarkRead', () => {
    it('calls markRead and emits chat:read-updated', async () => {
      const client = makeSocket('user-1');
      chatServiceMock.markRead.mockResolvedValue(undefined);

      await gateway.handleMarkRead(client as never, {
        conversationId: 'conv-1',
        messageId: 'msg-1',
      });

      expect(chatServiceMock.markRead).toHaveBeenCalledWith('user-1', 'conv-1', 'msg-1');
      expect(serverMock.to).toHaveBeenCalledWith('conversation:conv-1');
    });
  });

  // ── handleTypingStart / Stop ──────────────────────────────────────────────

  describe('typing indicators', () => {
    it('broadcasts chat:typing with isTyping=true on typing-start', async () => {
      const client = makeSocket('user-1');
      // client.to().emit() chain
      const emitMock = jest.fn();
      client.to = jest.fn().mockReturnValue({ emit: emitMock });

      await gateway.handleTypingStart(client as never, { conversationId: 'conv-1' });

      expect(client.to).toHaveBeenCalledWith('conversation:conv-1');
      expect(emitMock).toHaveBeenCalledWith('chat:typing', {
        conversationId: 'conv-1',
        userId: 'user-1',
        isTyping: true,
      });
    });

    it('broadcasts chat:typing with isTyping=false on typing-stop', async () => {
      const client = makeSocket('user-1');
      const emitMock = jest.fn();
      client.to = jest.fn().mockReturnValue({ emit: emitMock });

      await gateway.handleTypingStop(client as never, { conversationId: 'conv-1' });

      expect(emitMock).toHaveBeenCalledWith(
        'chat:typing',
        expect.objectContaining({ isTyping: false }),
      );
    });
  });
});
