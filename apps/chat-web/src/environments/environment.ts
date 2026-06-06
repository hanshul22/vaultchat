/**
 * Development environment config for chat-web.
 *
 * API_ORIGIN points at the NestJS API server directly so that HTTP requests
 * and the Socket.IO connection both reach the correct host regardless of
 * whether the Angular dev-server proxy is active.
 *
 * In production, replace this value with the real API origin (e.g. via a
 * build-time file replacement or an environment-specific build target).
 */
export const environment = {
  production: false,
  apiOrigin: 'http://localhost:3000',
};
