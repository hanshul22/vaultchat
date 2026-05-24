import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { User } from './entities/user.entity';
import { CloudinaryAccount, CloudinaryAccountRole } from '../cloudinary-accounts/entities/cloudinary-account.entity';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    @InjectRepository(CloudinaryAccount)
    private readonly cloudinaryAccountRepo: Repository<CloudinaryAccount>,
  ) {}

  /**
   * Loads a user by ID and computes onboardingComplete.
   * onboardingComplete = true when the user has at least one active Primary
   * Cloudinary account (PRD §4, RoadMap Phase 5).
   */
  async findMe(userId: string): Promise<UserResponseDto> {
    const user = await this.repo.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const primaryCount = await this.cloudinaryAccountRepo.count({
      where: {
        userId,
        role: CloudinaryAccountRole.PRIMARY,
        isActive: true,
      },
    });

    return new UserResponseDto(user, primaryCount > 0);
  }

  async create(data: { fullName: string; email: string; password: string }): Promise<User> {
    const existing = await this.repo.findOne({ where: { email: data.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await argon2.hash(data.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const user = this.repo.create({
      email: data.email,
      fullName: data.fullName,
      passwordHash,
    });

    return this.repo.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.repo.findOne({ where: { googleId } });
  }

  async createGoogleUser(data: { email: string; fullName: string; googleId: string }): Promise<User> {
    const user = this.repo.create({
      email: data.email,
      fullName: data.fullName,
      googleId: data.googleId,
      passwordHash: '',   // no password for Google-only accounts
    });
    return this.repo.save(user);
  }

  async verifyRefreshToken(userId: string, token: string): Promise<boolean> {
    const user = await this.repo.findOne({
      where: { id: userId },
      select: ['id', 'refreshTokenHash'],
    });
    if (!user?.refreshTokenHash) return false;
    const hash = createHash('sha256').update(token).digest('hex');
    return hash === user.refreshTokenHash;
  }

  async saveRefreshToken(userId: string, token: string): Promise<void> {
    const hash = createHash('sha256').update(token).digest('hex');
    await this.repo.update(userId, { refreshTokenHash: hash });
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.repo.update(userId, { refreshTokenHash: null });
  }

  async setPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.repo.update(userId, {
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: expiresAt,
    });
  }

  async findByPasswordResetTokenHash(hash: string): Promise<User | null> {
    return this.repo.findOne({ where: { passwordResetTokenHash: hash } });
  }

  async updatePasswordAndClearReset(userId: string, passwordHash: string): Promise<void> {
    await this.repo.update(userId, {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
    });
  }
}
