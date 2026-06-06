import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAccessGuard, JwtPayload } from '../auth/guards/jwt-access.guard';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatConversationResponseDto } from './dto/chat-conversation-response.dto';
import {
  ChatMessageListResponseDto,
  ChatMessageResponseDto,
} from './dto/chat-message-response.dto';

/**
 * Chat REST endpoints.
 * All routes are protected by JwtAccessGuard.
 * The global prefix `api/v1` is set in main.ts — do NOT add it here.
 */
@Controller('chat')
@UseGuards(JwtAccessGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * POST /api/v1/chat/conversations
   *
   * Creates a new conversation. For 1:1 conversations, deduplicates against
   * existing conversations with the same two participants and returns the
   * existing one if found.
   */
  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  createConversation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateConversationDto,
  ): Promise<ChatConversationResponseDto> {
    return this.chatService.createConversation(user.sub, dto);
  }

  /**
   * GET /api/v1/chat/conversations
   *
   * Returns the current user's conversations ordered by latest activity
   * (most recent message first, falling back to conversation.createdAt).
   */
  @Get('conversations')
  listConversations(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListConversationsQueryDto,
  ): Promise<ChatConversationResponseDto[]> {
    return this.chatService.listConversations(user.sub, query);
  }

  /**
   * GET /api/v1/chat/conversations/:id/messages
   *
   * Returns paginated messages for a conversation (oldest-first within page).
   * Only members of the conversation may access this endpoint.
   */
  @Get('conversations/:id/messages')
  listMessages(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<ChatMessageListResponseDto> {
    return this.chatService.listMessages(user.sub, conversationId, query);
  }

  /**
   * POST /api/v1/chat/conversations/:id/messages
   *
   * Sends a message to a conversation. Only members may send.
   * Supports optional media attachments (must be owned by the sender).
   */
  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  sendMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() dto: SendMessageDto,
  ): Promise<ChatMessageResponseDto> {
    return this.chatService.sendMessage(user.sub, conversationId, dto);
  }
}
