/**
 * Re-export from the shared auth library.
 *
 * The implementation now lives in libs/shared/src/auth/refresh-retry.interceptor.ts
 * and is shared with gallery-web and any future Angular app in this workspace.
 * This file is kept so existing imports within auth-web continue to resolve
 * without changes.
 */
export { refreshRetryInterceptor, IS_RETRY } from '@chat-media/shared/auth';
