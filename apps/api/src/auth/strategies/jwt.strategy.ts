import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Redis } from 'ioredis';
import { UsersService } from '../../users/users.service';
import { RootConfig } from '../../config/configuration';

export interface JwtPayload {
  sub: string;
  email: string;
  jti: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly usersService: UsersService,
    configService: ConfigService<RootConfig, true>,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.accessSecret', { infer: true }),
    });
  }

  async validate(payload: JwtPayload): Promise<{ id: string; email: string }> {
    const blacklisted = await this.redis.get(`jwt:blacklist:${payload.jti}`);
    if (blacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return { id: user.id, email: user.email };
  }
}
