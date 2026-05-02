export class UserResponseDto {
  id: string;
  email: string;
  fullName: string;
  googleId: string | null;
  createdAt: Date;

  constructor(partial: {
    id: string;
    email: string;
    fullName: string;
    googleId: string | null;
    createdAt: Date;
  }) {
    this.id = partial.id;
    this.email = partial.email;
    this.fullName = partial.fullName;
    this.googleId = partial.googleId;
    this.createdAt = partial.createdAt;
  }
}
