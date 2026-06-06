/**
 * Re-export from the shared auth library.
 *
 * The implementation now lives in libs/shared/src/auth/auth.guard.ts
 * and is shared with gallery-web and any future Angular app in this workspace.
 * This file is kept so existing imports within auth-web (e.g. app.routes.ts)
 * continue to resolve without changes.
 */
export { authGuard } from '@chat-media/shared/auth';
