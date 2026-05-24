import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User } from './entities/user.entity';
import { CloudinaryAccount, CloudinaryAccountRole } from '../cloudinary-accounts/entities/cloudinary-account.entity';
import { UserResponseDto } from './dto/user-response.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(CloudinaryAccount)
    private readonly cloudinaryAccountRepo: Repository<CloudinaryAccount>,
  ) {}

  /**
   * Loads a user by ID and computes onboardingComplete.
   * onboardingComplete = true when the user has at least one active Primary
   * Cloudinary account.
   */
  async findMe(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
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

  async saveRefreshToken(userId: string, rawToken: string): Promise<void> {
    const hash = await argon2.hash(rawToken, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await this.userRepo.update(userId, { refreshTokenHash: hash });
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.userRepo.update(userId, { refreshTokenHash: null });
  }

  async verifyRefreshToken(userId: string, rawToken: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user?.refreshTokenHash) return false;
    return argon2.verify(user.refreshTokenHash, rawToken);
  }

  async create(dto: CreateUserDto): Promise<User> {
    const email = dto.email.toLowerCase();
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const user = this.userRepo.create({
      email,
      fullName: dto.fullName,
      passwordHash,
    });

    return this.userRepo.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email: email.toLowerCase() } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { googleId } });
  }

  async createGoogleUser(data: {
    email: string;
    fullName: string;
    googleId: string;
  }): Promise<User> {
    const user = this.userRepo.create({
      email: data.email.toLowerCase(),
      fullName: data.fullName,
      googleId: data.googleId,
      passwordHash: null,
    });
    return this.userRepo.save(user);
  }

  async setPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.userRepo.update(userId, {
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: expiresAt,
    });
  }

  async findByPasswordResetTokenHash(tokenHash: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { passwordResetTokenHash: tokenHash } });
  }

  async clearPasswordResetToken(userId: string): Promise<void> {
    await this.userRepo.update(userId, {
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
    });
  }

  async updatePasswordAndClearReset(userId: string, passwordHash: string): Promise<void> {
    await this.userRepo.update(userId, {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
      refreshTokenHash: null,
    });
  }
}