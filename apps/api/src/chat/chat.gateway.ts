import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Inject, Logger, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';

import { RootConfig } from '../config/configuration';
import { ConversationMember } from '../conversations/entities/conversation-member.entity';
import { ChatService } from './chat.service';
import { ChatPresenceService } from './presence/chat-presence.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { ChatSocketAuthUser } from './interfaces/chat-socket-auth-user.interface';
import { SocketSendMessageDto } from './dto/socket-send-message.dto';
import { SocketTypingDto } from './dto/socket-typing.dto';
import { SocketGetPresenceDto } from './dto/socket-presence.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { extractSocketToken } from './utils/extract-socket-token';

interface RawJwtPayload {
  sub: string;
  email: string;
  jti: string;
  iat: number;
  exp: number;
}

/** Payload for `chat:join-conversation` and `chat:leave-conversation`. */
interface ConversationRoomPayload {
  conversationId: string;
}

/** Payload for `chat:mark-read`. */
interface MarkReadPayload {
  conversationId: string;
  messageId: string;
}

/** Room name convention: `conversation:{id}` */
function roomName(conversationId: string): string {
  return `conversation:${conversationId}`;
}

/**
 * Socket.IO gateway for real-time chat.
 *
 * Namespace : /chat
 * Auth      : Bearer JWT in handshake.auth.token or Authorization header.
 * Rooms     : `conversation:{id}` — joined explicitly by the client after
 *             membership is verified server-side.
 *
 * Event contract (client → server):
 *   chat:join-conversation   { conversationId }
 *   chat:leave-conversation  { conversationId }
 *   chat:send-message        { conversationId, body, mediaIds? }
 *   chat:typing-start        { conversationId }
 *   chat:typing-stop         { conversationId }
 *   chat:mark-read           { conversationId, messageId }
 *   chat:get-presence        { userIds }
 *
 * Event contract (server → client):
 *   chat:message-created     ChatMessageResponseDto
 *   chat:typing              { conversationId, userId, isTyping }
 *   chat:read-updated        { conversationId, userId, messageId }
 *   chat:presence-updated    PresenceStatusDto[]
 *   chat:error               { message }
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    // Permissive for local development; tighten via env in production.
    origin: '*',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly presenceService: ChatPresenceService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<RootConfig, true>,

    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,

    @InjectRepository(ConversationMember)
    private readonly memberRepo: Repository<ConversationMember>,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  afterInit(_server: Server): void {
    this.logger.log('ChatGateway initialised on namespace /chat');
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = extractSocketToken(client);

    if (!token) {
      this.rejectSocket(client, 'Missing access token');
      return;
    }

    let payload: RawJwtPayload;
    try {
      payload = this.jwtService.verify<RawJwtPayload>(token, {
        secret: this.configService.get('jwt.accessSecret', { infer: true }),
      });
    } catch {
      this.rejectSocket(client, 'Invalid or expired access token');
      return;
    }

    // Check Redis blacklist.
    if (payload.jti) {
      const blacklisted = await this.redis.get(`jwt:blacklist:${payload.jti}`);
      if (blacklisted) {
        this.rejectSocket(client, 'Access token has been revoked');
        return;
      }
    }

    const authUser: ChatSocketAuthUser = {
      id: payload.sub,
      email: payload.email,
      jti: payload.jti,
    };
    client.data['user'] = authUser;

    await this.presenceService.markSocketConnected(authUser.id, client.id);

    // Broadcast updated presence to all connected clients.
    const presenceList = await this.presenceService.getUsersPresence([authUser.id]);
    this.server.emit('chat:presence-updated', presenceList);

    this.logger.debug(`Socket connected: ${client.id} (user ${authUser.id})`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const authUser = this.getAuthUser(client);
    if (!authUser) return;

    await this.presenceService.markSocketDisconnected(authUser.id, client.id);

    // Broadcast updated presence.
    const presenceList = await this.presenceService.getUsersPresence([authUser.id]);
    this.server.emit('chat:presence-updated', presenceList);

    this.logger.debug(`Socket disconnected: ${client.id} (user ${authUser.id})`);
  }

  // ── Room management ───────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('chat:join-conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ConversationRoomPayload,
  ): Promise<void> {
    const authUser = this.requireAuthUser(client);
    const { conversationId } = payload;

    await this.assertMember(authUser.id, conversationId, client);

    await client.join(roomName(conversationId));
    this.logger.debug(`${authUser.id} joined room ${roomName(conversationId)}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('chat:leave-conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ConversationRoomPayload,
  ): Promise<void> {
    const { conversationId } = payload;
    await client.leave(roomName(conversationId));
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  @SubscribeMessage('chat:send-message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SocketSendMessageDto,
  ): Promise<void> {
    const authUser = this.requireAuthUser(client);

    await this.assertMember(authUser.id, dto.conversationId, client);

    const sendDto: SendMessageDto = {
      body: dto.body,
      mediaIds: dto.mediaIds,
    };

    let messageResponse;
    try {
      messageResponse = await this.chatService.sendMessage(
        authUser.id,
        dto.conversationId,
        sendDto,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      client.emit('chat:error', { message });
      return;
    }

    // Emit to all sockets in the conversation room (including sender).
    this.server.to(roomName(dto.conversationId)).emit('chat:message-created', messageResponse);

    // Refresh presence heartbeat on activity.
    await this.presenceService.refreshPresence(authUser.id);
  }

  // ── Typing indicators ─────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  @SubscribeMessage('chat:typing-start')
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SocketTypingDto,
  ): Promise<void> {
    const authUser = this.requireAuthUser(client);
    // Broadcast to room excluding the sender.
    client.to(roomName(dto.conversationId)).emit('chat:typing', {
      conversationId: dto.conversationId,
      userId: authUser.id,
      isTyping: true,
    });
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  @SubscribeMessage('chat:typing-stop')
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SocketTypingDto,
  ): Promise<void> {
    const authUser = this.requireAuthUser(client);
    client.to(roomName(dto.conversationId)).emit('chat:typing', {
      conversationId: dto.conversationId,
      userId: authUser.id,
      isTyping: false,
    });
  }

  // ── Mark read ─────────────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('chat:mark-read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MarkReadPayload,
  ): Promise<void> {
    const authUser = this.requireAuthUser(client);
    const { conversationId, messageId } = payload;

    try {
      await this.chatService.markRead(authUser.id, conversationId, messageId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark read';
      client.emit('chat:error', { message });
      return;
    }

    this.server.to(roomName(conversationId)).emit('chat:read-updated', {
      conversationId,
      userId: authUser.id,
      messageId,
    });
  }

  // ── Presence ──────────────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  @SubscribeMessage('chat:get-presence')
  async handleGetPresence(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SocketGetPresenceDto,
  ): Promise<void> {
    const presenceList = await this.presenceService.getUsersPresence(dto.userIds);
    client.emit('chat:presence-updated', presenceList);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private getAuthUser(client: Socket): ChatSocketAuthUser | null {
    return (client.data?.['user'] as ChatSocketAuthUser) ?? null;
  }

  private requireAuthUser(client: Socket): ChatSocketAuthUser {
    const user = this.getAuthUser(client);
    if (!user) throw new WsException('Unauthenticated');
    return user;
  }

  private rejectSocket(client: Socket, reason: string): void {
    client.emit('chat:error', { message: reason });
    client.disconnect(true);
  }

  /**
   * Verifies the user is a member of the conversation.
   * Emits `chat:error` and throws WsException on failure.
   */
  private async assertMember(
    userId: string,
    conversationId: string,
    client: Socket,
  ): Promise<void> {
    const membership = await this.memberRepo.findOne({
      where: { conversationId, userId },
    });
    if (!membership) {
      client.emit('chat:error', { message: 'You are not a member of this conversation.' });
      throw new WsException('Forbidden');
    }
  }
}
