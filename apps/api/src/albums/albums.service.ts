import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Album } from './entities/album.entity';
import { AlbumMedia } from './entities/album-media.entity';
import { Media } from '../media/entities/media.entity';
import { CreateAlbumDto } from './dto/create-album.dto';
import { UpdateAlbumDto } from './dto/update-album.dto';
import { AlbumListQueryDto } from './dto/album-list-query.dto';
import {
  AlbumDetailResponseDto,
  AlbumListResponseDto,
  AlbumMediaItemDto,
  AlbumResponseDto,
} from './dto/album-response.dto';

@Injectable()
export class AlbumsService {
  private readonly logger = new Logger(AlbumsService.name);

  constructor(
    @InjectRepository(Album)
    private readonly albumRepo: Repository<Album>,
    @InjectRepository(AlbumMedia)
    private readonly albumMediaRepo: Repository<AlbumMedia>,
    @InjectRepository(Media)
    private readonly mediaRepo: Repository<Media>,
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────

  /**
   * POST /api/albums.
   *
   * If `coverMediaId` is supplied, the referenced media must exist and be
   * owned by the requesting user (PRD §8).
   */
  async create(userId: string, dto: CreateAlbumDto): Promise<AlbumResponseDto> {
    if (dto.coverMediaId) {
      await this.assertOwnedMedia(userId, dto.coverMediaId);
    }

    const album = this.albumRepo.create({
      ownerId: userId,
      name: dto.name,
      description: dto.description ?? null,
      coverMediaId: dto.coverMediaId ?? null,
    });

    const saved = await this.albumRepo.save(album);

    this.logger.log(`Album created: id=${saved.id} userId=${userId}`);

    return new AlbumResponseDto(saved, 0);
  }

  // ── List ──────────────────────────────────────────────────────────────────

  /**
   * GET /api/albums — owner's albums only, newest first, paginated.
   */
  async findAllForUser(userId: string, query: AlbumListQueryDto): Promise<AlbumListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 40;

    // Fetch albums + their join-row counts in a single query using a
    // LEFT JOIN subquery so we avoid N+1 count calls.
    const [albums, total] = await this.albumRepo
      .createQueryBuilder('album')
      .where('album.owner_id = :userId', { userId })
      .orderBy('album.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Batch-fetch counts for the returned page only.
    const counts = await this.batchMediaCounts(albums.map((a) => a.id));

    const items = albums.map((album) => ({
      album,
      mediaCount: counts.get(album.id) ?? 0,
    }));

    return new AlbumListResponseDto(items, page, limit, total);
  }

  // ── Detail ────────────────────────────────────────────────────────────────

  /**
   * GET /api/albums/:id — owner-only detail with lightweight media list.
   */
  async findOneForUser(userId: string, albumId: string): Promise<AlbumDetailResponseDto> {
    const album = await this.getOwnedAlbumOrThrow(userId, albumId);

    // Fetch join rows ordered by addedAt DESC (matches the index).
    const joinRows = await this.albumMediaRepo.find({
      where: { albumId },
      order: { addedAt: 'DESC' },
      select: ['mediaId', 'addedAt'],
    });

    const mediaItems = joinRows.map((r) => new AlbumMediaItemDto(r.mediaId, r.addedAt));

    return new AlbumDetailResponseDto(album, joinRows.length, mediaItems);
  }

  // ── Update ────────────────────────────────────────────────────────────────

  /**
   * PATCH /api/albums/:id.
   *
   * Omitted fields are not changed. Explicit null for `description` or
   * `coverMediaId` clears those columns.
   */
  async update(userId: string, albumId: string, dto: UpdateAlbumDto): Promise<AlbumResponseDto> {
    const album = await this.getOwnedAlbumOrThrow(userId, albumId);

    if (dto.name !== undefined) {
      album.name = dto.name;
    }

    if (dto.description !== undefined) {
      album.description = dto.description ?? null;
    }

    if (dto.coverMediaId !== undefined) {
      if (dto.coverMediaId !== null) {
        await this.assertOwnedMedia(userId, dto.coverMediaId);
      }
      album.coverMediaId = dto.coverMediaId ?? null;
    }

    const saved = await this.albumRepo.save(album);

    this.logger.log(`Album updated: id=${albumId} userId=${userId}`);

    const count = await this.albumMediaRepo.count({ where: { albumId } });
    return new AlbumResponseDto(saved, count);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  /**
   * DELETE /api/albums/:id.
   *
   * Deletes the album row only. The `album_media` join rows are removed by
   * the CASCADE on the album_id FK (AlbumMedia entity, onDelete: 'CASCADE').
   * The underlying Media rows are NEVER touched.
   */
  async remove(userId: string, albumId: string): Promise<{ deleted: true }> {
    const album = await this.getOwnedAlbumOrThrow(userId, albumId);

    await this.albumRepo.delete({ id: album.id });

    this.logger.log(`Album deleted: id=${albumId} userId=${userId}`);

    return { deleted: true };
  }

  // ── Add media ─────────────────────────────────────────────────────────────

  /**
   * POST /api/albums/:id/media.
   *
   * Inserts a join row. Returns 409 if the media is already in the album.
   * Only media owned by the requesting user may be added (PRD §8).
   */
  async addMedia(userId: string, albumId: string, mediaId: string): Promise<AlbumResponseDto> {
    const album = await this.getOwnedAlbumOrThrow(userId, albumId);
    await this.assertOwnedMedia(userId, mediaId);

    const existing = await this.albumMediaRepo.findOne({
      where: { albumId, mediaId },
    });

    if (existing) {
      throw new ConflictException(`Media ${mediaId} is already in album ${albumId}.`);
    }

    const joinRow = this.albumMediaRepo.create({
      albumId,
      mediaId,
      orderIndex: null,
    });

    await this.albumMediaRepo.save(joinRow);

    this.logger.log(`Media added to album: albumId=${albumId} mediaId=${mediaId} userId=${userId}`);

    const count = await this.albumMediaRepo.count({ where: { albumId } });
    return new AlbumResponseDto(album, count);
  }

  // ── Remove media ──────────────────────────────────────────────────────────

  /**
   * DELETE /api/albums/:id/media/:mediaId.
   *
   * Removes the join row only — the Media row is never deleted.
   * If the removed media was the album cover, `coverMediaId` is cleared.
   */
  async removeMedia(userId: string, albumId: string, mediaId: string): Promise<AlbumResponseDto> {
    const album = await this.getOwnedAlbumOrThrow(userId, albumId);

    const joinRow = await this.albumMediaRepo.findOne({
      where: { albumId, mediaId },
    });

    if (!joinRow) {
      throw new NotFoundException(`Media ${mediaId} is not in album ${albumId}.`);
    }

    await this.albumMediaRepo.delete({ albumId, mediaId });

    // Clear the cover reference if the removed item was the cover.
    if (album.coverMediaId === mediaId) {
      await this.albumRepo.update({ id: albumId }, { coverMediaId: null });
      album.coverMediaId = null;
    }

    this.logger.log(
      `Media removed from album: albumId=${albumId} mediaId=${mediaId} userId=${userId}`,
    );

    const count = await this.albumMediaRepo.count({ where: { albumId } });
    return new AlbumResponseDto(album, count);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Loads an album by ID and verifies it belongs to `userId`.
   * Throws NotFoundException if the album does not exist or is not owned by
   * the user — the two cases are intentionally indistinguishable to callers
   * to avoid leaking album existence to non-owners.
   */
  private async getOwnedAlbumOrThrow(userId: string, albumId: string): Promise<Album> {
    const album = await this.albumRepo.findOne({
      where: { id: albumId, ownerId: userId },
    });

    if (!album) {
      throw new NotFoundException(`Album ${albumId} not found.`);
    }

    return album;
  }

  /**
   * Verifies that a media item exists and is owned by `userId`.
   * Throws NotFoundException if the media does not exist or belongs to a
   * different user — same intentional ambiguity as getOwnedAlbumOrThrow.
   */
  private async assertOwnedMedia(userId: string, mediaId: string): Promise<void> {
    const media = await this.mediaRepo.findOne({
      where: { id: mediaId, ownerId: userId },
      select: ['id'],
    });

    if (!media) {
      throw new NotFoundException(`Media ${mediaId} not found or does not belong to you.`);
    }
  }

  /**
   * Returns a Map<albumId, count> for the given album IDs.
   * Uses a single GROUP BY query instead of N individual COUNT calls.
   */
  private async batchMediaCounts(albumIds: string[]): Promise<Map<string, number>> {
    if (albumIds.length === 0) return new Map();

    const rows = (await this.albumMediaRepo
      .createQueryBuilder('am')
      .select('am.album_id', 'albumId')
      .addSelect('COUNT(*)', 'cnt')
      .where('am.album_id IN (:...ids)', { ids: albumIds })
      .groupBy('am.album_id')
      .getRawMany()) as Array<{ albumId: string; cnt: string }>;

    return new Map(rows.map((r) => [r.albumId, Number(r.cnt)]));
  }
}
