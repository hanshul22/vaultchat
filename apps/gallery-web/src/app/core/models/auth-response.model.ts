import { User } from './user.model';

export interface AuthResponse {
  accessToken: string;
  user: User;
}
