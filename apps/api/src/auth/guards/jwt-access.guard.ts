import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Redis } from 'ioredis';
import { RootConfig } from '../../config/configuration';

export interface JwtPayload {
  sub: string;
  email: string;
  jti: string;
  iat: number;
  exp: number;
}

/**
 * Guards a route by verifying the Bearer access token from the
 * Authorization header. Also checks the Redis blacklist so that
 * logged-out tokens are rejected immediately.
 *
 * On success, attaches the decoded payload to `request.user`.
 */
@Injectable()
export class JwtAccessGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<RootConfig, true>,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearer(request);

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get('jwt.accessSecret', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    // Reject tokens that have been explicitly revoked (logout blacklist).
    if (payload.jti) {
      const blacklisted = await this.redis.get(`jwt:blacklist:${payload.jti}`);
      if (blacklisted) {
        throw new UnauthorizedException('Access token has been revoked');
      }
    }

    (request as Request & { user: JwtPayload }).user = payload;
    return true;
  }

  private extractBearer(request: Request): string | null {
    const auth = request.headers?.['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }
}
