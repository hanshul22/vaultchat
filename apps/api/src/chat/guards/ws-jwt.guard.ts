import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Redis } from 'ioredis';
import { Socket } from 'socket.io';

import { RootConfig } from '../../config/configuration';
import { ChatSocketAuthUser } from '../interfaces/chat-socket-auth-user.interface';
import { extractSocketToken } from '../utils/extract-socket-token';

interface RawJwtPayload {
  sub: string;
  email: string;
  jti: string;
  iat: number;
  exp: number;
}

/**
 * WebSocket guard that mirrors the HTTP JwtAccessGuard logic:
 *  - Extracts the Bearer token from the socket handshake.
 *  - Verifies the JWT signature and expiry.
 *  - Rejects tokens present in the Redis blacklist.
 *  - Attaches the decoded user to `socket.data.user`.
 *
 * Used on individual event handlers inside the gateway.
 * The gateway's handleConnection hook performs the same check at
 * connection time and disconnects immediately on failure, so this guard
 * is a defence-in-depth layer for individual events.
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<RootConfig, true>,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();

    // If the gateway's handleConnection already attached the user, skip
    // re-verification to avoid redundant Redis round-trips.
    if (client.data?.['user']) {
      return true;
    }

    const token = extractSocketToken(client);
    if (!token) {
      throw new WsException('Missing access token');
    }

    let payload: RawJwtPayload;
    try {
      payload = this.jwtService.verify<RawJwtPayload>(token, {
        secret: this.configService.get('jwt.accessSecret', { infer: true }),
      });
    } catch {
      throw new WsException('Invalid or expired access token');
    }

    if (payload.jti) {
      const blacklisted = await this.redis.get(`jwt:blacklist:${payload.jti}`);
      if (blacklisted) {
        throw new WsException('Access token has been revoked');
      }
    }

    const authUser: ChatSocketAuthUser = {
      id: payload.sub,
      email: payload.email,
      jti: payload.jti,
    };
    client.data['user'] = authUser;
    return true;
  }
}
