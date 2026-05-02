import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
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
  ) {}

  async signup(dto: SignupDto): Promise<{ accessToken: string; user: UserResponseDto }> {
    const user = await this.usersService.create({
      fullName: dto.fullName,
      email: dto.email,
      password: dto.password,
    });
    const accessToken = this.issueAccessToken(user.id, user.email);
    // TODO: issue refresh token (Phase 3, Step 6)
    return { accessToken, user: new UserResponseDto(user) };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; user: UserResponseDto }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const accessToken = this.issueAccessToken(user.id, user.email);
    // TODO: issue refresh token (Phase 3, Step 6)
    return { accessToken, user: new UserResponseDto(user) };
  }

  private issueAccessToken(userId: string, email: string): string {
    const payload = { sub: userId, email };
    return this.jwtService.sign(payload, {
      secret: this.configService.get('jwt.accessSecret', { infer: true }),
      expiresIn: this.configService.get('jwt.accessTtl', { infer: true }),
    });
  }
}
