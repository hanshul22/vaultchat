import { Test, TestingModule } from '@nestjs/testing';
import { ChatPresenceService } from './chat-presence.service';

// ── Redis mock ────────────────────────────────────────────────────────────────

/**
 * Minimal in-memory Redis mock that covers the commands used by
 * ChatPresenceService: sadd, srem, scard, expire, set, del, exists, get,
 * and pipeline().
 */
class RedisMock {
  private store = new Map<string, string | Set<string>>();

  async sadd(key: string, ...members: string[]): Promise<number> {
    let set = this.store.get(key) as Set<string> | undefined;
    if (!set) {
      set = new Set();
      this.store.set(key, set);
    }
    let added = 0;
    for (const m of members) {
      if (!set.has(m)) {
        set.add(m);
        added++;
      }
    }
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.store.get(key) as Set<string> | undefined;
    if (!set) return 0;
    let removed = 0;
    for (const m of members) {
      if (set.delete(m)) removed++;
    }
    return removed;
  }

  async scard(key: string): Promise<number> {
    const set = this.store.get(key) as Set<string> | undefined;
    return set?.size ?? 0;
  }

  async expire(_key: string, _ttl: number): Promise<number> {
    return 1; // always succeeds in tests
  }

  async set(key: string, value: string, ..._args: unknown[]): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
    }
    return count;
  }

  async exists(...keys: string[]): Promise<number> {
    return keys.filter((k) => this.store.has(k)).length;
  }

  async get(key: string): Promise<string | null> {
    const val = this.store.get(key);
    return typeof val === 'string' ? val : null;
  }

  /** Minimal pipeline: collects commands and executes them sequentially. */
  pipeline() {
    const commands: Array<() => Promise<[null, unknown]>> = [];
    const pipe = {
      sadd: (key: string, ...members: string[]) => {
        commands.push(async () => [null, await this.sadd(key, ...members)]);
        return pipe;
      },
      srem: (key: string, ...members: string[]) => {
        commands.push(async () => [null, await this.srem(key, ...members)]);
        return pipe;
      },
      expire: (key: string, ttl: number) => {
        commands.push(async () => [null, await this.expire(key, ttl)]);
        return pipe;
      },
      set: (key: string, value: string, ...args: unknown[]) => {
        commands.push(async () => [null, await this.set(key, value, ...args)]);
        return pipe;
      },
      del: (...keys: string[]) => {
        commands.push(async () => [null, await this.del(...keys)]);
        return pipe;
      },
      exists: (...keys: string[]) => {
        commands.push(async () => [null, await this.exists(...keys)]);
        return pipe;
      },
      get: (key: string) => {
        commands.push(async () => [null, await this.get(key)]);
        return pipe;
      },
      exec: async () => {
        const results: Array<[null, unknown]> = [];
        for (const cmd of commands) {
          results.push(await cmd());
        }
        return results;
      },
    };
    return pipe;
  }

  /** Test helper: clear all state between tests. */
  _clear() {
    this.store.clear();
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatPresenceService', () => {
  let service: ChatPresenceService;
  let redisMock: RedisMock;

  beforeEach(async () => {
    redisMock = new RedisMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ChatPresenceService, { provide: 'REDIS_CLIENT', useValue: redisMock }],
    }).compile();

    service = module.get<ChatPresenceService>(ChatPresenceService);
  });

  afterEach(() => {
    redisMock._clear();
  });

  // ── markSocketConnected ───────────────────────────────────────────────────

  describe('markSocketConnected', () => {
    it('adds the socket to the user socket set', async () => {
      await service.markSocketConnected('user-1', 'socket-a');
      const count = await redisMock.scard('presence:sockets:user-1');
      expect(count).toBe(1);
    });

    it('marks the user as online', async () => {
      await service.markSocketConnected('user-1', 'socket-a');
      const online = await service.isOnline('user-1');
      expect(online).toBe(true);
    });

    it('handles multiple sockets for the same user', async () => {
      await service.markSocketConnected('user-1', 'socket-a');
      await service.markSocketConnected('user-1', 'socket-b');
      const count = await redisMock.scard('presence:sockets:user-1');
      expect(count).toBe(2);
    });
  });

  // ── markSocketDisconnected ────────────────────────────────────────────────

  describe('markSocketDisconnected', () => {
    it('removes the socket from the user socket set', async () => {
      await service.markSocketConnected('user-1', 'socket-a');
      await service.markSocketDisconnected('user-1', 'socket-a');
      const count = await redisMock.scard('presence:sockets:user-1');
      expect(count).toBe(0);
    });

    it('marks user offline when last socket disconnects', async () => {
      await service.markSocketConnected('user-1', 'socket-a');
      await service.markSocketDisconnected('user-1', 'socket-a');
      const online = await service.isOnline('user-1');
      expect(online).toBe(false);
    });

    it('keeps user online when other sockets remain', async () => {
      await service.markSocketConnected('user-1', 'socket-a');
      await service.markSocketConnected('user-1', 'socket-b');
      await service.markSocketDisconnected('user-1', 'socket-a');
      const online = await service.isOnline('user-1');
      expect(online).toBe(true);
    });

    it('writes lastSeenAt when last socket disconnects', async () => {
      await service.markSocketConnected('user-1', 'socket-a');
      await service.markSocketDisconnected('user-1', 'socket-a');
      const lastSeen = await redisMock.get('presence:lastseen:user-1');
      expect(lastSeen).not.toBeNull();
      // Should be a valid ISO timestamp.
      expect(new Date(lastSeen!).getTime()).not.toBeNaN();
    });

    it('does not write lastSeenAt when other sockets remain', async () => {
      await service.markSocketConnected('user-1', 'socket-a');
      await service.markSocketConnected('user-1', 'socket-b');
      await service.markSocketDisconnected('user-1', 'socket-a');
      const lastSeen = await redisMock.get('presence:lastseen:user-1');
      expect(lastSeen).toBeNull();
    });
  });

  // ── isOnline ──────────────────────────────────────────────────────────────

  describe('isOnline', () => {
    it('returns false for a user who has never connected', async () => {
      const online = await service.isOnline('unknown-user');
      expect(online).toBe(false);
    });
  });

  // ── getUsersPresence ──────────────────────────────────────────────────────

  describe('getUsersPresence', () => {
    it('returns empty array for empty input', async () => {
      const result = await service.getUsersPresence([]);
      expect(result).toHaveLength(0);
    });

    it('returns correct online/offline status for multiple users', async () => {
      await service.markSocketConnected('user-online', 'socket-1');
      // user-offline never connected

      const result = await service.getUsersPresence(['user-online', 'user-offline']);

      const onlineEntry = result.find((r) => r.userId === 'user-online');
      const offlineEntry = result.find((r) => r.userId === 'user-offline');

      expect(onlineEntry?.isOnline).toBe(true);
      expect(offlineEntry?.isOnline).toBe(false);
    });

    it('includes lastSeenAt for offline users who previously disconnected', async () => {
      await service.markSocketConnected('user-1', 'socket-a');
      await service.markSocketDisconnected('user-1', 'socket-a');

      const result = await service.getUsersPresence(['user-1']);
      expect(result[0].isOnline).toBe(false);
      expect(result[0].lastSeenAt).not.toBeNull();
    });
  });

  // ── refreshPresence ───────────────────────────────────────────────────────

  describe('refreshPresence', () => {
    it('does not throw when called for a connected user', async () => {
      await service.markSocketConnected('user-1', 'socket-a');
      await expect(service.refreshPresence('user-1')).resolves.not.toThrow();
    });
  });
});
