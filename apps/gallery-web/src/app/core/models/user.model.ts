export interface User {
  id: string;
  email: string;
  fullName: string;
  googleId: string | null;
  onboardingComplete: boolean;
  createdAt: string;
}
