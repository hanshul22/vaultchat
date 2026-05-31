export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
}

export interface PresenceStatus {
  userId: string;
  isOnline: boolean;
  lastSeenAt: string | null;
}
