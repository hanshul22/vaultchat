import { IsArray, IsUUID } from 'class-validator';

/** Payload for the `chat:get-presence` WebSocket event. */
export class SocketGetPresenceDto {
  @IsArray()
  @IsUUID('4', { each: true })
  userIds!: string[];
}

/** Shape of a single user's presence status emitted to clients. */
export class PresenceStatusDto {
  userId!: string;
  isOnline!: boolean;
  /** ISO timestamp of when the presence key was last refreshed. */
  lastSeenAt!: string | null;
}
