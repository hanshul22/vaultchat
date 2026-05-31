import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { Album } from './entities/album.entity';
import { AlbumMedia } from './entities/album-media.entity';
import { Media } from '../media/entities/media.entity';
import { AlbumsService } from './albums.service';

// ── In-memory fakes ──────────────────────────────────────────────────────────

interface FakeAlbum {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  coverMediaId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeAlbumMedia {
  albumId: string;
  mediaId: string;
  orderIndex: number | null;
  addedAt: Date;
}

interface FakeMedia {
  id: string;
  ownerId: string;
}

let albumIdSeq = 0;
const nextAlbumId = () => `album-${++albumIdSeq}`;

/**
 * Builds an AlbumsService wired to in-memory stores.
 * Each call gets a fresh, isolated store.
 */
const makeService = (
  opts: {
    albums?: FakeAlbum[];
    albumMedia?: FakeAlbumMedia[];
    media?: FakeMedia[];
  } = {},
) => {
  const albums: FakeAlbum[] = opts.albums ? [...opts.albums] : [];
  const albumMedia: FakeAlbumMedia[] = opts.albumMedia ? [...opts.albumMedia] : [];
  const media: FakeMedia[] = opts.media ? [...opts.media] : [];

  // ── Album repository mock ──────────────────────────────────────────────────
  const albumRepo = {
    create: (input: Partial<FakeAlbum>) => ({ ...input }) as FakeAlbum,

    save: jest.fn(async (input: FakeAlbum) => {
      const existing = albums.findIndex((a) => a.id === input.id);
      if (existing >= 0) {
        albums[existing] = { ...albums[existing]!, ...input };
        return albums[existing]!;
      }
      const row: FakeAlbum = {
        ...input,
        id: input.id ?? nextAlbumId(),
        createdAt: input.createdAt ?? new Date(),
        updatedAt: input.updatedAt ?? new Date(),
      } as FakeAlbum;
      albums.push(row);
      return row;
    }),

    findOne: jest.fn(
      async ({ where }: { where: Partial<FakeAlbum> }) =>
        albums.find((a) =>
          Object.entries(where).every(([k, v]) => a[k as keyof FakeAlbum] === v),
        ) ?? null,
    ),

    delete: jest.fn(async ({ id }: { id: string }) => {
      const idx = albums.findIndex((a) => a.id === id);
      if (idx >= 0) albums.splice(idx, 1);
      return { affected: idx >= 0 ? 1 : 0 };
    }),

    update: jest.fn(async (criteria: { id: string }, partial: Partial<FakeAlbum>) => {
      const row = albums.find((a) => a.id === criteria.id);
      if (row) Object.assign(row, partial);
      return { affected: row ? 1 : 0 };
    }),

    createQueryBuilder: jest.fn(() => {
      let _userId: string | null = null;
      let _skip = 0;
      let _take = 40;

      const qb: Record<string, unknown> = {
        where: (_cond: string, params?: { userId?: string }) => {
          if (params?.userId) _userId = params.userId;
          return qb;
        },
        orderBy: () => qb,
        skip: (n: number) => {
          _skip = n;
          return qb;
        },
        take: (n: number) => {
          _take = n;
          return qb;
        },
        getManyAndCount: async () => {
          const filtered = _userId ? albums.filter((a) => a.ownerId === _userId) : albums;
          const sorted = [...filtered].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );
          const page = sorted.slice(_skip, _skip + _take);
          return [page, filtered.length];
        },
      };
      return qb;
    }),
  } as unknown as Repository<Album>;

  // ── AlbumMedia repository mock ─────────────────────────────────────────────
  const albumMediaRepo = {
    create: (input: Partial<FakeAlbumMedia>) => ({ ...input }) as FakeAlbumMedia,

    save: jest.fn(async (input: FakeAlbumMedia) => {
      const row: FakeAlbumMedia = {
        ...input,
        addedAt: input.addedAt ?? new Date(),
        orderIndex: input.orderIndex ?? null,
      };
      albumMedia.push(row);
      return row;
    }),

    findOne: jest.fn(
      async ({ where }: { where: Partial<FakeAlbumMedia> }) =>
        albumMedia.find((r) =>
          Object.entries(where).every(([k, v]) => r[k as keyof FakeAlbumMedia] === v),
        ) ?? null,
    ),

    find: jest.fn(
      async ({
        where,
        order,
        select: _select,
      }: {
        where: Partial<FakeAlbumMedia>;
        order?: Record<string, string>;
        select?: string[];
      }) => {
        let rows = albumMedia.filter((r) =>
          Object.entries(where).every(([k, v]) => r[k as keyof FakeAlbumMedia] === v),
        );
        if (order?.addedAt === 'DESC') {
          rows = [...rows].sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
        }
        return rows;
      },
    ),

    count: jest.fn(
      async ({ where }: { where: Partial<FakeAlbumMedia> }) =>
        albumMedia.filter((r) =>
          Object.entries(where).every(([k, v]) => r[k as keyof FakeAlbumMedia] === v),
        ).length,
    ),

    delete: jest.fn(async (criteria: Partial<FakeAlbumMedia>) => {
      const before = albumMedia.length;
      const toRemove = albumMedia.filter((r) =>
        Object.entries(criteria).every(([k, v]) => r[k as keyof FakeAlbumMedia] === v),
      );
      for (const r of toRemove) {
        albumMedia.splice(albumMedia.indexOf(r), 1);
      }
      return { affected: before - albumMedia.length };
    }),

    createQueryBuilder: jest.fn(() => {
      let _ids: string[] = [];
      const qb: Record<string, unknown> = {
        select: () => qb,
        addSelect: () => qb,
        where: (_cond: string, params?: { ids?: string[] }) => {
          if (params?.ids) _ids = params.ids;
          return qb;
        },
        groupBy: () => qb,
        getRawMany: async () =>
          _ids.map((id) => ({
            albumId: id,
            cnt: String(albumMedia.filter((r) => r.albumId === id).length),
          })),
      };
      return qb;
    }),
  } as unknown as Repository<AlbumMedia>;

  // ── Media repository mock ──────────────────────────────────────────────────
  const mediaRepo = {
    findOne: jest.fn(
      async ({ where }: { where: Partial<FakeMedia> }) =>
        media.find((m) => Object.entries(where).every(([k, v]) => m[k as keyof FakeMedia] === v)) ??
        null,
    ),
  } as unknown as Repository<Media>;

  const service = new AlbumsService(albumRepo, albumMediaRepo, mediaRepo);

  return { service, albums, albumMedia, media, albumRepo, albumMediaRepo, mediaRepo };
};

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER_A = 'user-a';
const USER_B = 'user-b';

const makeAlbum = (overrides: Partial<FakeAlbum> = {}): FakeAlbum => ({
  id: nextAlbumId(),
  ownerId: USER_A,
  name: 'My Album',
  description: null,
  coverMediaId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeMedia = (id: string, ownerId = USER_A): FakeMedia => ({
  id,
  ownerId,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AlbumsService', () => {
  beforeEach(() => {
    albumIdSeq = 0;
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates an album with no cover and returns mediaCount 0', async () => {
      const { service } = makeService();

      const result = await service.create(USER_A, { name: 'Vacation' });

      expect(result.name).toBe('Vacation');
      expect(result.ownerId).toBe(USER_A);
      expect(result.coverMediaId).toBeNull();
      expect(result.mediaCount).toBe(0);
    });

    it('creates an album with a valid owned cover', async () => {
      const { service } = makeService({
        media: [makeMedia('media-1', USER_A)],
      });

      const result = await service.create(USER_A, {
        name: 'With Cover',
        coverMediaId: 'media-1',
      });

      expect(result.coverMediaId).toBe('media-1');
    });

    it('rejects a cover that belongs to a different user', async () => {
      const { service } = makeService({
        media: [makeMedia('media-1', USER_B)], // owned by USER_B
      });

      await expect(
        service.create(USER_A, { name: 'Bad Cover', coverMediaId: 'media-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a cover that does not exist', async () => {
      const { service } = makeService({ media: [] });

      await expect(
        service.create(USER_A, {
          name: 'Ghost Cover',
          coverMediaId: 'nonexistent-uuid',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── findAllForUser ──────────────────────────────────────────────────────────

  describe('findAllForUser', () => {
    it('returns only albums owned by the requesting user', async () => {
      const albumA = makeAlbum({ ownerId: USER_A });
      const albumB = makeAlbum({ ownerId: USER_B });
      const { service } = makeService({ albums: [albumA, albumB] });

      const result = await service.findAllForUser(USER_A, { page: 1, limit: 40 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.ownerId).toBe(USER_A);
    });

    it('returns correct pagination meta', async () => {
      const albums = Array.from({ length: 5 }, () => makeAlbum());
      const { service } = makeService({ albums });

      const result = await service.findAllForUser(USER_A, { page: 1, limit: 3 });

      expect(result.data).toHaveLength(3);
      expect(result.meta.total).toBe(5);
      expect(result.meta.totalPages).toBe(2);
    });

    it('includes correct mediaCount per album', async () => {
      const album = makeAlbum();
      const { service, albumMedia } = makeService({ albums: [album] });
      albumMedia.push(
        { albumId: album.id, mediaId: 'm1', orderIndex: null, addedAt: new Date() },
        { albumId: album.id, mediaId: 'm2', orderIndex: null, addedAt: new Date() },
      );

      const result = await service.findAllForUser(USER_A, { page: 1, limit: 40 });

      expect(result.data[0]!.mediaCount).toBe(2);
    });
  });

  // ── findOneForUser ──────────────────────────────────────────────────────────

  describe('findOneForUser', () => {
    it('returns the album detail for the owner', async () => {
      const album = makeAlbum();
      const { service } = makeService({ albums: [album] });

      const result = await service.findOneForUser(USER_A, album.id);

      expect(result.id).toBe(album.id);
      expect(result.media).toEqual([]);
    });

    it('throws NotFoundException for a non-existent album', async () => {
      const { service } = makeService();

      await expect(service.findOneForUser(USER_A, 'no-such-album')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the album belongs to another user', async () => {
      const album = makeAlbum({ ownerId: USER_B });
      const { service } = makeService({ albums: [album] });

      await expect(service.findOneForUser(USER_A, album.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates only the supplied fields', async () => {
      const album = makeAlbum({ name: 'Old Name', description: 'Old Desc' });
      const { service } = makeService({ albums: [album] });

      const result = await service.update(USER_A, album.id, { name: 'New Name' });

      expect(result.name).toBe('New Name');
      expect(result.description).toBe('Old Desc'); // unchanged
    });

    it('clears description when explicit null is passed', async () => {
      const album = makeAlbum({ description: 'Some text' });
      const { service } = makeService({ albums: [album] });

      const result = await service.update(USER_A, album.id, { description: null });

      expect(result.description).toBeNull();
    });

    it('clears coverMediaId when explicit null is passed', async () => {
      const album = makeAlbum({ coverMediaId: 'media-1' });
      const { service } = makeService({ albums: [album] });

      const result = await service.update(USER_A, album.id, { coverMediaId: null });

      expect(result.coverMediaId).toBeNull();
    });

    it("rejects a cover update pointing to another user's media", async () => {
      const album = makeAlbum();
      const { service } = makeService({
        albums: [album],
        media: [makeMedia('media-x', USER_B)],
      });

      await expect(
        service.update(USER_A, album.id, { coverMediaId: 'media-x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── addMedia ────────────────────────────────────────────────────────────────

  describe('addMedia', () => {
    it('adds owned media to the album and returns updated count', async () => {
      const album = makeAlbum();
      const { service } = makeService({
        albums: [album],
        media: [makeMedia('media-1', USER_A)],
      });

      const result = await service.addMedia(USER_A, album.id, 'media-1');

      expect(result.mediaCount).toBe(1);
    });

    it('returns 409 when the media is already in the album', async () => {
      const album = makeAlbum();
      const { service } = makeService({
        albums: [album],
        media: [makeMedia('media-1', USER_A)],
        albumMedia: [
          { albumId: album.id, mediaId: 'media-1', orderIndex: null, addedAt: new Date() },
        ],
      });

      await expect(service.addMedia(USER_A, album.id, 'media-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects media owned by a different user', async () => {
      const album = makeAlbum();
      const { service } = makeService({
        albums: [album],
        media: [makeMedia('media-1', USER_B)], // owned by USER_B
      });

      await expect(service.addMedia(USER_A, album.id, 'media-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects when the album belongs to another user', async () => {
      const album = makeAlbum({ ownerId: USER_B });
      const { service } = makeService({
        albums: [album],
        media: [makeMedia('media-1', USER_A)],
      });

      await expect(service.addMedia(USER_A, album.id, 'media-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── removeMedia ─────────────────────────────────────────────────────────────

  describe('removeMedia', () => {
    it('removes a media item from the album', async () => {
      const album = makeAlbum();
      const { service, albumMedia } = makeService({
        albums: [album],
        albumMedia: [
          { albumId: album.id, mediaId: 'media-1', orderIndex: null, addedAt: new Date() },
        ],
      });

      const result = await service.removeMedia(USER_A, album.id, 'media-1');

      expect(result.mediaCount).toBe(0);
      expect(albumMedia).toHaveLength(0);
    });

    it('clears coverMediaId when the removed item was the cover', async () => {
      const album = makeAlbum({ coverMediaId: 'media-1' });
      const { service } = makeService({
        albums: [album],
        albumMedia: [
          { albumId: album.id, mediaId: 'media-1', orderIndex: null, addedAt: new Date() },
        ],
      });

      const result = await service.removeMedia(USER_A, album.id, 'media-1');

      expect(result.coverMediaId).toBeNull();
    });

    it('does not clear coverMediaId when a non-cover item is removed', async () => {
      const album = makeAlbum({ coverMediaId: 'media-1' });
      const { service } = makeService({
        albums: [album],
        albumMedia: [
          { albumId: album.id, mediaId: 'media-1', orderIndex: null, addedAt: new Date() },
          { albumId: album.id, mediaId: 'media-2', orderIndex: null, addedAt: new Date() },
        ],
      });

      const result = await service.removeMedia(USER_A, album.id, 'media-2');

      expect(result.coverMediaId).toBe('media-1');
    });

    it('throws NotFoundException when the media is not in the album', async () => {
      const album = makeAlbum();
      const { service } = makeService({ albums: [album] });

      await expect(service.removeMedia(USER_A, album.id, 'media-ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── remove (delete album) ───────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes the album and returns { deleted: true }', async () => {
      const album = makeAlbum();
      const { service, albums } = makeService({ albums: [album] });

      const result = await service.remove(USER_A, album.id);

      expect(result).toEqual({ deleted: true });
      expect(albums).toHaveLength(0);
    });

    it('does NOT call any media deletion logic', async () => {
      const album = makeAlbum();
      const { service, mediaRepo } = makeService({
        albums: [album],
        media: [makeMedia('media-1', USER_A)],
        albumMedia: [
          { albumId: album.id, mediaId: 'media-1', orderIndex: null, addedAt: new Date() },
        ],
      });

      await service.remove(USER_A, album.id);

      // The media repository must never be called during album deletion.
      expect(mediaRepo.findOne).not.toHaveBeenCalled();
      expect((mediaRepo as unknown as { delete?: jest.Mock }).delete).toBeUndefined();
    });

    it('throws NotFoundException for a non-existent album', async () => {
      const { service } = makeService();

      await expect(service.remove(USER_A, 'no-such-album')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the album belongs to another user', async () => {
      const album = makeAlbum({ ownerId: USER_B });
      const { service } = makeService({ albums: [album] });

      await expect(service.remove(USER_A, album.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
