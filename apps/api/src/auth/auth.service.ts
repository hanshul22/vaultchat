import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import { createHash, randomBytes, randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { Redis } from 'ioredis';
import { UsersService } from '../users/users.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { RootConfig } from '../config/configuration';
import { GoogleUserProfile } from './strategies/google.strategy';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<RootConfig, true>,
    private readonly mailService: MailService,
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

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account was created with Google. Use Google to sign in, or use Forgot Password to set a password and enable email login.',
      );
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const accessToken = this.issueAccessToken(user.id, user.email);
    await this.issueRefreshToken(user.id, res);
    return { accessToken, user: new UserResponseDto(user) };
  }

  async refresh(req: Request, res: Response): Promise<{ accessToken: string }> {
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

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const successMessage =
      'If an account with that email exists, a password reset link has been sent.';

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      return { message: successMessage };
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.usersService.setPasswordResetToken(user.id, tokenHash, expiresAt);

    try {
      await this.mailService.sendPasswordResetEmail(user.email, rawToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown mail error';

      this.logger.error(`Failed to send password reset email to ${user.email}: ${message}`);

      if (process.env['NODE_ENV'] !== 'production') {
        const frontendAuthUrl = process.env['FRONTEND_AUTH_URL'] ?? 'http://localhost:4200';
        const resetUrl = `${frontendAuthUrl}/reset-password?token=${rawToken}`;

        this.logger.warn(`DEV ONLY password reset URL for ${user.email}: ${resetUrl}`);
      }
    }

    return { message: successMessage };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const user = await this.usersService.findByPasswordResetTokenHash(tokenHash);
    if (!user) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    if (
      !user.passwordResetTokenExpiresAt ||
      user.passwordResetTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    const newPasswordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    await this.usersService.updatePasswordAndClearReset(user.id, newPasswordHash);

    return { message: 'Password has been set successfully.' };
  }

  async loginWithGoogle(
    googleUser: GoogleUserProfile,
    res: Response,
  ): Promise<{ accessToken: string; user: UserResponseDto }> {
    let user = await this.usersService.findByGoogleId(googleUser.googleId);

    if (!user) {
      const existing = await this.usersService.findByEmail(googleUser.email);
      if (existing) {
        throw new ConflictException(
          'An account with this email already exists. Please sign in with email and password.',
        );
      }

      user = await this.usersService.createGoogleUser({
        email: googleUser.email,
        fullName: googleUser.fullName,
        googleId: googleUser.googleId,
      });
    }

    const accessToken = this.issueAccessToken(user.id, user.email);
    await this.issueRefreshToken(user.id, res);
    return { accessToken, user: new UserResponseDto(user) };
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
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth/refresh',
      maxAge: refreshTtl * 1000,
    });
  }
}
