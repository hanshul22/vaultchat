import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAccessGuard, JwtPayload } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CloudinaryAccountsService } from './cloudinary-accounts.service';
import { CreateCloudinaryAccountDto } from './dto/create-cloudinary-account.dto';
import { CloudinaryAccountResponseDto } from './dto/cloudinary-account-response.dto';

@Controller('v1/cloudinary-accounts')
@UseGuards(JwtAccessGuard)
export class CloudinaryAccountsController {
  constructor(private readonly service: CloudinaryAccountsService) {}

  /**
   * DELETE /api/v1/cloudinary-accounts/:id?force=true
   *
   * Soft-deactivates a Cloudinary account (isActive = false).
   * - Returns 409 if the account is the active Primary.
   * - Returns 409 if the account has linked media and force is not true.
   * - With force=true, marks linked media as orphaned then deactivates.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('force') force?: string,
  ): Promise<{ deactivated: boolean; orphanedMediaCount: number; message: string }> {
    return this.service.deactivate(user.sub, id, force === 'true');
  }

  /**
   * GET /api/v1/cloudinary-accounts
   *
   * Returns the authenticated user's active Cloudinary accounts ordered
   * as: Primary → Secondary slot 1 → Secondary slot 2.
   * No secret or encrypted secret is ever included in the response.
   */
  @Get()
  async findAll(
    @CurrentUser() user: JwtPayload,
  ): Promise<CloudinaryAccountResponseDto[]> {
    return this.service.findAllForUser(user.sub);
  }

  /**
   * PATCH /api/v1/cloudinary-accounts/:id/swap-order
   *
   * Swaps the display order of the user's two active Secondary accounts
   * (slot 1 ↔ slot 2). The :id must belong to the authenticated user and
   * serves as an ownership anchor. The Primary is never affected.
   * Returns the full ordered account list reflecting the new state.
   */
  @Patch(':id/swap-order')
  @HttpCode(HttpStatus.OK)
  async swapOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<CloudinaryAccountResponseDto[]> {
    return this.service.swapSecondaryOrder(user.sub, id);
  }

  /**
   * PATCH /api/v1/cloudinary-accounts/:id/promote
   *
   * Promotes a Secondary account to Primary. The current Primary is
   * atomically demoted to Secondary in the promoted account's previous slot.
   * Returns the full ordered account list reflecting the new state.
   */
  @Patch(':id/promote')
  @HttpCode(HttpStatus.OK)
  async promote(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<CloudinaryAccountResponseDto[]> {
    return this.service.promote(user.sub, id);
  }

  /**
   * POST /api/v1/cloudinary-accounts/:id/verify
   *
   * Re-pings Cloudinary with the stored (decrypted) credentials to confirm
   * they are still valid. Never returns the secret.
   */
  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ verified: boolean; message: string }> {
    return this.service.verifyAccount(user.sub, id);
  }

  /**
   * POST /api/v1/cloudinary-accounts
   *
   * Adds a new Cloudinary account for the authenticated user.
   * Credentials are verified against Cloudinary before saving.
   * api_secret is encrypted at rest; never returned in responses.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCloudinaryAccountDto,
  ): Promise<CloudinaryAccountResponseDto> {
    return this.service.create(user.sub, dto);
  }
}
