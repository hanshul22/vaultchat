import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile as UploadedFileParam,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { JwtAccessGuard, JwtPayload } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MediaService, UploadedFile } from './media.service';
import { UploadPreflightDto, MAX_UPLOAD_SIZE_BYTES } from './dto/upload-preflight.dto';
import { MediaUploadDto } from './dto/media-upload.dto';
import { MediaListQueryDto } from './dto/media-list-query.dto';
import { MediaListResponseDto, MediaResponseDto } from './dto/media-response.dto';
import { PreflightResult } from './types/preflight-result.type';

@Controller('media')
@UseGuards(JwtAccessGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * POST /api/media/upload/preflight
   *
   * Deterministic, quota-free check the UI runs before a large upload.
   * Returns the target account on success, or a 507-style reason on failure.
   */
  @Post('upload/preflight')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async preflight(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UploadPreflightDto,
  ): Promise<PreflightResult> {
    return this.mediaService.preflight(user.sub, dto.fileSizeBytes, dto.mimeType);
  }

  /**
   * POST /api/media/upload (multipart/form-data)
   *
   * The binary arrives as the `file` part; optional metadata (e.g.
   * storageSpaceId) arrives as additional form fields. Multer keeps the file
   * in memory so we can run a magic-byte check and stream it to Cloudinary.
   */
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES, files: 1 },
    }),
  )
  async upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFileParam() file: UploadedFile,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: MediaUploadDto,
  ): Promise<MediaResponseDto> {
    return this.mediaService.upload(user.sub, file, {
      storageSpaceId: body.storageSpaceId ?? null,
    });
  }

  /**
   * GET /api/media?page=&limit=&type=
   *
   * Owner's media only, newest first, paginated (default limit 40, max 100).
   */
  @Get()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() query: MediaListQueryDto,
  ): Promise<MediaListResponseDto> {
    return this.mediaService.list(user.sub, query);
  }

  /**
   * DELETE /api/media/:id
   *
   * Owner-only. Removes from Cloudinary, then the DB, decrementing the owning
   * account's used bytes.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ deleted: true }> {
    return this.mediaService.remove(user.sub, id);
  }
}
