import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAccessGuard, JwtPayload } from '../../auth/guards/jwt-access.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { DirectUploadService, InitUploadResponse, SignPartResponse } from './direct-upload.service';
import { InitDirectUploadDto } from './dto/init-direct-upload.dto';
import { SignPartDto } from './dto/sign-part.dto';
import { CompleteDirectUploadDto } from './dto/complete-direct-upload.dto';
import { AbortDirectUploadDto } from './dto/abort-direct-upload.dto';
import { Media } from '../entities/media.entity';

/**
 * Browser-to-Cloudinary direct upload endpoints.
 *
 * All routes are protected by JwtAccessGuard and live under
 * /api/v1/media/direct-upload (global prefix api/v1 is set in main.ts).
 *
 * SECURITY: api_secret, api_key, and any Cloudinary credential are never
 * returned. Signed URLs and uploadId are the only upload-flow values exposed.
 */
@Controller('media/direct-upload')
@UseGuards(JwtAccessGuard)
export class DirectUploadController {
  constructor(private readonly directUploadService: DirectUploadService) {}

  /**
   * POST /api/v1/media/direct-upload/init
   *
   * Runs the vault-fill preflight, reserves storage, and returns a
   * server-generated uploadId plus a signed Cloudinary upload URL.
   */
  @Post('init')
  @HttpCode(HttpStatus.CREATED)
  init(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitDirectUploadDto,
  ): Promise<InitUploadResponse> {
    return this.directUploadService.initUpload(user.sub, dto);
  }

  /**
   * POST /api/v1/media/direct-upload/sign-part
   *
   * Signs the URL for the next sequential part.
   * Rejects out-of-order requests with 409 Conflict.
   */
  @Post('sign-part')
  @HttpCode(HttpStatus.OK)
  signPart(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SignPartDto,
  ): Promise<SignPartResponse> {
    return this.directUploadService.signNextPart(user.sub, dto);
  }

  /**
   * POST /api/v1/media/direct-upload/complete
   *
   * Finalises the upload: writes the Media record to Postgres,
   * swaps reserved bytes for actual bytes, clears the Redis session.
   */
  @Post('complete')
  @HttpCode(HttpStatus.CREATED)
  complete(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CompleteDirectUploadDto,
  ): Promise<Media> {
    return this.directUploadService.completeUpload(user.sub, dto);
  }

  /**
   * DELETE /api/v1/media/direct-upload/abort
   *
   * Aborts the session: releases reserved bytes, best-effort Cloudinary
   * cleanup, deletes the Redis session. Idempotent.
   */
  @Delete('abort')
  @HttpCode(HttpStatus.NO_CONTENT)
  abort(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AbortDirectUploadDto,
  ): Promise<void> {
    return this.directUploadService.abortUpload(user.sub, dto);
  }
}
