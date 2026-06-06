import { User } from './user.model';

export interface AuthState {
  accessToken: string | null;
  user: User | null;
}
