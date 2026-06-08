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
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { JwtAccessGuard, JwtPayload } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MediaService } from './media.service';
import { UploadPreflightDto } from './dto/upload-preflight.dto';
import { MediaListQueryDto } from './dto/media-list-query.dto';
import { MediaListResponseDto } from './dto/media-response.dto';
import { DirectUploadAbortDto } from './dto/direct-upload-abort.dto';
import { DirectUploadCompleteDto } from './dto/direct-upload-complete.dto';
import { DirectUploadInitDto } from './dto/direct-upload-init.dto';
import { DirectUploadSignPartDto } from './dto/direct-upload-sign-part.dto';
import { DirectUploadCompleteResponse } from './types/direct-upload-complete-response.type';
import { DirectUploadInitResponse } from './types/direct-upload-init-response.type';
import { DirectUploadSignPartResponse } from './types/direct-upload-sign-part-response.type';
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
   * Binary uploads now go browser → Cloudinary directly; see direct-upload-init.
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

  @Post('direct-upload-init')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async directUploadInit(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DirectUploadInitDto,
  ): Promise<DirectUploadInitResponse> {
    return this.mediaService.directUploadInit(user.sub, dto);
  }

  @Post('direct-upload-sign-part')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async directUploadSignPart(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DirectUploadSignPartDto,
  ): Promise<DirectUploadSignPartResponse> {
    return this.mediaService.directUploadSignPart(user.sub, dto);
  }

  @Post('direct-upload-complete')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async directUploadComplete(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DirectUploadCompleteDto,
  ): Promise<DirectUploadCompleteResponse> {
    return this.mediaService.directUploadComplete(user.sub, dto);
  }

  @Post('direct-upload-abort')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async directUploadAbort(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DirectUploadAbortDto,
  ): Promise<{ success: true }> {
    return this.mediaService.directUploadAbort(user.sub, dto);
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
