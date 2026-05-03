import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { Redis } from 'ioredis';
import { UsersService } from '../users/users.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { RootConfig } from '../config/configuration';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<RootConfig, true>,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async signup(
    dto: SignupDto,
    res: Response,
  ): Promise<{ accessToken: string; user: UserResponseDto }> {
    const user = await this.usersService.create({
      fullName: dto.fullName,
      email: dto.email,
      password: dto.password,
    });
    const accessToken = this.issueAccessToken(user.id, user.email);
    await this.issueRefreshToken(user.id, res);
    return { accessToken, user: new UserResponseDto(user) };
  }

  async login(
    dto: LoginDto,
    res: Response,
  ): Promise<{ accessToken: string; user: UserResponseDto }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const accessToken = this.issueAccessToken(user.id, user.email);
    await this.issueRefreshToken(user.id, res);
    return { accessToken, user: new UserResponseDto(user) };
  }

  async refresh(
    req: Request,
    res: Response,
  ): Promise<{ accessToken: string }> {
    const rawToken: string | undefined = (req.cookies as Record<string, string>)['refresh_token'];
    if (!rawToken) {
      throw new UnauthorizedException('Refresh token missing');
    }
    let payload: { sub: string; email: string };
    try {
      payload = this.jwtService.verify(rawToken, {
        secret: this.configService.get('jwt.refreshSecret', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const valid = await this.usersService.verifyRefreshToken(payload.sub, rawToken);
    if (!valid) {
      throw new UnauthorizedException('Refresh token revoked');
    }
    await this.usersService.clearRefreshToken(payload.sub);
    const accessToken = this.issueAccessToken(payload.sub, payload.email);
    await this.issueRefreshToken(payload.sub, res);
    return { accessToken };
  }

  async logout(userId: string, accessToken: string): Promise<void> {
    let payload: { jti?: string; exp?: number };
    try {
      payload = this.jwtService.decode(accessToken) as { jti?: string; exp?: number };
    } catch {
      return;
    }
    if (payload?.jti && payload?.exp) {
      const ttl = payload.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.redis.set(`jwt:blacklist:${payload.jti}`, '1', 'EX', ttl);
      }
    }
    await this.usersService.clearRefreshToken(userId);
  }

  private issueAccessToken(userId: string, email: string): string {
    const payload = { sub: userId, email, jti: randomUUID() };
    return this.jwtService.sign(payload, {
      secret: this.configService.get('jwt.accessSecret', { infer: true }),
      expiresIn: this.configService.get('jwt.accessTtl', { infer: true }),
    });
  }

  private async issueRefreshToken(userId: string, res: Response): Promise<void> {
    const raw = randomBytes(32).toString('hex');
    const refreshTtl = this.configService.get('jwt.refreshTtl', { infer: true });
    
    // We sign the raw cryptographically secure token into a JWT.
    const signed = this.jwtService.sign(
      { sub: userId, hash: raw },
      {
        secret: this.configService.get('jwt.refreshSecret', { infer: true }),
        expiresIn: refreshTtl,
      },
    );
    await this.usersService.saveRefreshToken(userId, signed);
    res.cookie('refresh_token', signed, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/api/v1/auth/refresh',
      maxAge: refreshTtl * 1000,
    });
  }
}
