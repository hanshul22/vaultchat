import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { JwtAccessGuard, JwtPayload } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AlbumsService } from './albums.service';
import { CreateAlbumDto } from './dto/create-album.dto';
import { UpdateAlbumDto } from './dto/update-album.dto';
import { AlbumListQueryDto } from './dto/album-list-query.dto';
import { AddAlbumMediaDto } from './dto/add-album-media.dto';
import {
  AlbumDetailResponseDto,
  AlbumListResponseDto,
  AlbumResponseDto,
} from './dto/album-response.dto';

@Controller('albums')
@UseGuards(JwtAccessGuard)
export class AlbumsController {
  constructor(private readonly albumsService: AlbumsService) {}

  /**
   * POST /api/albums
   *
   * Creates a new album for the authenticated user. If `coverMediaId` is
   * supplied it must reference a media item owned by the same user.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAlbumDto): Promise<AlbumResponseDto> {
    return this.albumsService.create(user.sub, dto);
  }

  /**
   * GET /api/albums?page=&limit=
   *
   * Returns the authenticated user's albums, newest first, paginated.
   */
  @Get()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: AlbumListQueryDto,
  ): Promise<AlbumListResponseDto> {
    return this.albumsService.findAllForUser(user.sub, query);
  }

  /**
   * GET /api/albums/:id
   *
   * Returns the album detail including a lightweight ordered media list.
   * Only the owner can access their albums.
   */
  @Get(':id')
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AlbumDetailResponseDto> {
    return this.albumsService.findOneForUser(user.sub, id);
  }

  /**
   * PATCH /api/albums/:id
   *
   * Partial update. Omitted fields are unchanged; explicit null for
   * `description` or `coverMediaId` clears those columns.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateAlbumDto,
  ): Promise<AlbumResponseDto> {
    return this.albumsService.update(user.sub, id, dto);
  }

  /**
   * DELETE /api/albums/:id
   *
   * Deletes the album and its join rows. The underlying media items are
   * never deleted.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ deleted: true }> {
    return this.albumsService.remove(user.sub, id);
  }

  /**
   * POST /api/albums/:id/media
   *
   * Adds a media item to the album. The media must be owned by the same user.
   * Returns 409 if the media is already in the album.
   */
  @Post(':id/media')
  @HttpCode(HttpStatus.OK)
  addMedia(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: AddAlbumMediaDto,
  ): Promise<AlbumResponseDto> {
    return this.albumsService.addMedia(user.sub, id, dto.mediaId);
  }

  /**
   * DELETE /api/albums/:id/media/:mediaId
   *
   * Removes a media item from the album. The media row itself is not deleted.
   * If the removed item was the album cover, the cover is cleared.
   */
  @Delete(':id/media/:mediaId')
  @HttpCode(HttpStatus.OK)
  removeMedia(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
  ): Promise<AlbumResponseDto> {
    return this.albumsService.removeMedia(user.sub, id, mediaId);
  }
}
