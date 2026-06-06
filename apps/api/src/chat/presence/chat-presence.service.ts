import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PresenceStatusDto } from '../dto/socket-presence.dto';

/**
 * Redis key layout
 * ─────────────────────────────────────────────────────────────────────────────
 * presence:user:{userId}          STRING  "1"  TTL = PRESENCE_TTL_SECONDS
 *   Existence = online. Refreshed on every heartbeat / connect.
 *   Expires automatically → user goes offline without an explicit disconnect.
 *
 * presence:sockets:{userId}       SET     { socketId, ... }
 *   Tracks which socket IDs belong to this user so we only clear the
 *   presence key when the last socket disconnects.
 *   TTL = SOCKET_SET_TTL_SECONDS (slightly longer than presence TTL so the
 *   set outlives the presence key during a brief network blip).
 *
 * presence:lastseen:{userId}      STRING  ISO timestamp
 *   Written on disconnect; read when isOnline = false to show "last seen".
 *   No TTL — kept indefinitely (small string, useful for UI).
 */

/** Seconds until the presence key expires if no heartbeat arrives. */
const PRESENCE_TTL_SECONDS = 60;

/** Seconds until the socket-set key expires (safety net). */
const SOCKET_SET_TTL_SECONDS = 120;

@Injectable()
export class ChatPresenceService {
  private readonly logger = new Logger(ChatPresenceService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  // ── Key helpers ───────────────────────────────────────────────────────────

  private presenceKey(userId: string): string {
    return `presence:user:${userId}`;
  }

  private socketSetKey(userId: string): string {
    return `presence:sockets:${userId}`;
  }

  private lastSeenKey(userId: string): string {
    return `presence:lastseen:${userId}`;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Called when a socket successfully authenticates and connects.
   * Adds the socketId to the user's socket set and marks the user online.
   */
  async markSocketConnected(userId: string, socketId: string): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.sadd(this.socketSetKey(userId), socketId);
      pipeline.expire(this.socketSetKey(userId), SOCKET_SET_TTL_SECONDS);
      pipeline.set(this.presenceKey(userId), '1', 'EX', PRESENCE_TTL_SECONDS);
      await pipeline.exec();
    } catch (err) {
      this.logger.error(`markSocketConnected failed for ${userId}: ${String(err)}`);
    }
  }

  /**
   * Called when a socket disconnects.
   * Removes the socketId from the user's socket set.
   * If no sockets remain, writes lastSeenAt and removes the presence key.
   */
  async markSocketDisconnected(userId: string, socketId: string): Promise<void> {
    try {
      await this.redis.srem(this.socketSetKey(userId), socketId);
      const remaining = await this.redis.scard(this.socketSetKey(userId));

      if (remaining === 0) {
        // Last socket gone — record last-seen and remove presence key.
        const now = new Date().toISOString();
        const pipeline = this.redis.pipeline();
        pipeline.set(this.lastSeenKey(userId), now);
        pipeline.del(this.presenceKey(userId));
        await pipeline.exec();
      }
    } catch (err) {
      this.logger.error(`markSocketDisconnected failed for ${userId}: ${String(err)}`);
    }
  }

  /**
   * Refreshes the presence TTL for a user (heartbeat).
   * Call this periodically from the gateway or on any meaningful event.
   */
  async refreshPresence(userId: string): Promise<void> {
    try {
      await this.redis.expire(this.presenceKey(userId), PRESENCE_TTL_SECONDS);
    } catch (err) {
      this.logger.error(`refreshPresence failed for ${userId}: ${String(err)}`);
    }
  }

  /**
   * Returns true if the user currently has an active presence key in Redis.
   */
  async isOnline(userId: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(this.presenceKey(userId));
      return result === 1;
    } catch (err) {
      this.logger.error(`isOnline failed for ${userId}: ${String(err)}`);
      return false;
    }
  }

  /**
   * Returns presence status for a batch of user IDs.
   * Uses a pipeline for efficiency.
   */
  async getUsersPresence(userIds: string[]): Promise<PresenceStatusDto[]> {
    if (userIds.length === 0) return [];

    try {
      const pipeline = this.redis.pipeline();
      for (const uid of userIds) {
        pipeline.exists(this.presenceKey(uid));
        pipeline.get(this.lastSeenKey(uid));
      }
      const results = await pipeline.exec();

      return userIds.map((userId, i) => {
        const existsResult = results?.[i * 2];
        const lastSeenResult = results?.[i * 2 + 1];

        const isOnline = existsResult?.[1] === 1;
        const lastSeenAt = typeof lastSeenResult?.[1] === 'string' ? lastSeenResult[1] : null;

        const dto = new PresenceStatusDto();
        dto.userId = userId;
        dto.isOnline = isOnline;
        dto.lastSeenAt = lastSeenAt;
        return dto;
      });
    } catch (err) {
      this.logger.error(`getUsersPresence failed: ${String(err)}`);
      // Degrade gracefully — return all offline.
      return userIds.map((userId) => {
        const dto = new PresenceStatusDto();
        dto.userId = userId;
        dto.isOnline = false;
        dto.lastSeenAt = null;
        return dto;
      });
    }
  }
}
