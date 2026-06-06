/**
 * Authenticated user data attached to a socket after successful handshake.
 * Stored on `socket.data.user` by the gateway's handleConnection hook.
 */
export interface ChatSocketAuthUser {
  /** User UUID (JWT `sub` claim). */
  id: string;
  /** User email (JWT `email` claim). */
  email: string;
  /** JWT ID used for blacklist checks. */
  jti: string;
}
