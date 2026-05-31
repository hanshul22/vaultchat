import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Conversation } from '../conversations/entities/conversation.entity';
import { ConversationMember } from '../conversations/entities/conversation-member.entity';
import { Message } from '../messages/entities/message.entity';
import { MessageMedia } from '../messages/entities/message-media.entity';
import { Media } from '../media/entities/media.entity';
import { User } from '../users/entities/user.entity';

import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatPresenceService } from './presence/chat-presence.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      ConversationMember,
      Message,
      MessageMedia,
      Media,
      User,
    ]),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, ChatPresenceService, WsJwtGuard],
  exports: [ChatService, ChatPresenceService],
})
export class ChatModule {}
