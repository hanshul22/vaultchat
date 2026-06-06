import { Socket } from 'socket.io';

/**
 * Extracts the Bearer access token from a Socket.IO handshake.
 *
 * Checks (in order):
 *  1. `handshake.auth.token`  — preferred; set by the client as
 *     `{ auth: { token: '<jwt>' } }` in the socket constructor options.
 *  2. `handshake.headers.authorization` — fallback for clients that send
 *     a standard HTTP Authorization header during the upgrade request.
 *
 * Returns `null` when no token is found.
 */
export function extractSocketToken(socket: Socket): string | null {
  // 1. auth object
  const authToken = (socket.handshake.auth as Record<string, unknown>)?.['token'];
  if (typeof authToken === 'string' && authToken.length > 0) {
    return authToken;
  }

  // 2. Authorization header
  const authHeader = socket.handshake.headers?.['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}
