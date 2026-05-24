import { User } from '../entities/user.entity';

/**
 * Safe public representation of a user.
 * Deliberately excludes passwordHash, refreshTokenHash, and reset-token fields.
 */
export class UserResponseDto {
  id!: string;
  email!: string;
  fullName!: string;
  /**
   * True once the user has at least one active Primary Cloudinary account.
   * Drives the onboarding gate on the frontend (PRD §4, RoadMap Phase 5).
   */
  onboardingComplete!: boolean;
  createdAt!: Date;

  constructor(user: User, onboardingComplete: boolean) {
    this.id = user.id;
    this.email = user.email;
    this.fullName = user.fullName;
    this.onboardingComplete = onboardingComplete;
    this.createdAt = user.createdAt;
  }
}
