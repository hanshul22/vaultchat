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
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAccessGuard, JwtPayload } from '../auth/guards/jwt-access.guard';
import { RequireSpaceRole } from './decorators/require-space-role.decorator';
import { AddStorageSpaceMemberDto } from './dto/add-storage-space-member.dto';
import { AssignMediaToSpaceDto } from './dto/assign-media-to-space.dto';
import { CreateStorageSpaceDto } from './dto/create-storage-space.dto';
import { ListStorageSpacesQueryDto } from './dto/list-storage-spaces-query.dto';
import { UpdateStorageSpaceDto } from './dto/update-storage-space.dto';
import { UpdateStorageSpaceMemberRoleDto } from './dto/update-storage-space-member-role.dto';
import { StorageSpaceMemberRole } from './enums/storage-space-member-role.enum';
import { SpaceRoleGuard } from './guards/space-role.guard';
import { StorageSpacesService } from './storage-spaces.service';

@Controller('storage-spaces')
@UseGuards(JwtAccessGuard)
export class StorageSpacesController {
  constructor(private readonly storageSpacesService: StorageSpacesService) {}

  /** POST /api/v1/storage-spaces — create a new space (caller becomes owner) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateStorageSpaceDto) {
    return this.storageSpacesService.create(user.sub, dto);
  }

  /** GET /api/v1/storage-spaces — list spaces the caller owns or is a member of */
  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: ListStorageSpacesQueryDto) {
    return this.storageSpacesService.findAllForUser(user.sub, query);
  }

  /** GET /api/v1/storage-spaces/:id */
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.storageSpacesService.findOneForUser(id, user.sub);
  }

  /** PATCH /api/v1/storage-spaces/:id — owner only (enforced in service) */
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStorageSpaceDto,
  ) {
    return this.storageSpacesService.update(id, user.sub, dto);
  }

  /** DELETE /api/v1/storage-spaces/:id — owner only (enforced in service) */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.storageSpacesService.remove(id, user.sub);
  }

  // ── Member management (owner-only, enforced in service) ──────────────────

  /** POST /api/v1/storage-spaces/:id/members */
  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  addMember(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddStorageSpaceMemberDto,
  ) {
    return this.storageSpacesService.addMember(id, user.sub, dto);
  }

  /** PATCH /api/v1/storage-spaces/:id/members/:memberUserId */
  @Patch(':id/members/:memberUserId')
  updateMemberRole(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberUserId', ParseUUIDPipe) memberUserId: string,
    @Body() dto: UpdateStorageSpaceMemberRoleDto,
  ) {
    return this.storageSpacesService.updateMemberRole(id, user.sub, memberUserId, dto);
  }

  /** DELETE /api/v1/storage-spaces/:id/members/:memberUserId */
  @Delete(':id/members/:memberUserId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberUserId', ParseUUIDPipe) memberUserId: string,
  ) {
    return this.storageSpacesService.removeMember(id, user.sub, memberUserId);
  }

  // ── Media assignment (editors + owner allowed) ───────────────────────────

  /**
   * POST /api/v1/storage-spaces/:spaceId/media
   * Requires at least EDITOR role (owner always passes via SpaceRoleGuard).
   */
  @Post(':spaceId/media')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SpaceRoleGuard)
  @RequireSpaceRole(StorageSpaceMemberRole.EDITOR)
  assignMedia(
    @CurrentUser() user: JwtPayload,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Body() dto: AssignMediaToSpaceDto,
  ) {
    return this.storageSpacesService.assignMedia(spaceId, user.sub, dto);
  }
}
