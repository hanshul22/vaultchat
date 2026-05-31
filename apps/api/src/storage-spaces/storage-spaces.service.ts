import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Media } from '../media/entities/media.entity';
import { User } from '../users/entities/user.entity';
import { AddStorageSpaceMemberDto } from './dto/add-storage-space-member.dto';
import { AssignMediaToSpaceDto } from './dto/assign-media-to-space.dto';
import { CreateStorageSpaceDto } from './dto/create-storage-space.dto';
import { ListStorageSpacesQueryDto } from './dto/list-storage-spaces-query.dto';
import { StorageSpaceDetailResponseDto } from './dto/storage-space-detail-response.dto';
import { StorageSpaceMemberResponseDto } from './dto/storage-space-member-response.dto';
import { StorageSpaceResponseDto } from './dto/storage-space-response.dto';
import { UpdateStorageSpaceDto } from './dto/update-storage-space.dto';
import { UpdateStorageSpaceMemberRoleDto } from './dto/update-storage-space-member-role.dto';
import { StorageMember } from './entities/storage-member.entity';
import { StorageSpace } from './entities/storage-space.entity';
import { StorageSpaceMemberRole } from './enums/storage-space-member-role.enum';
import { SpaceActor } from './interfaces/space-actor.interface';

@Injectable()
export class StorageSpacesService {
  constructor(
    @InjectRepository(StorageSpace)
    private readonly spaceRepo: Repository<StorageSpace>,
    @InjectRepository(StorageMember)
    private readonly memberRepo: Repository<StorageMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Media)
    private readonly mediaRepo: Repository<Media>,
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────

  async create(ownerId: string, dto: CreateStorageSpaceDto): Promise<StorageSpaceResponseDto> {
    const space = this.spaceRepo.create({
      ownerId,
      name: dto.name,
      description: dto.description ?? null,
    });
    const saved = await this.spaceRepo.save(space);
    return this.toSpaceResponse(saved, ownerId);
  }

  // ── List ──────────────────────────────────────────────────────────────────

  async findAllForUser(
    userId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _query?: ListStorageSpacesQueryDto,
  ): Promise<StorageSpaceResponseDto[]> {
    // Owned spaces
    const ownedSpaces = await this.spaceRepo.find({
      where: { ownerId: userId },
    });

    // Member spaces
    const memberships = await this.memberRepo.find({
      where: { userId },
      relations: ['storageSpace'],
    });

    // Deduplicate by id (owner can't also be a member, but be defensive)
    const spaceMap = new Map<
      string,
      { space: StorageSpace; role: StorageSpaceMemberRole | null }
    >();

    for (const space of ownedSpaces) {
      spaceMap.set(space.id, { space, role: null });
    }
    for (const m of memberships) {
      if (!spaceMap.has(m.spaceId)) {
        spaceMap.set(m.spaceId, { space: m.storageSpace, role: m.role });
      }
    }

    const spaceIds = [...spaceMap.keys()];
    if (spaceIds.length === 0) return [];

    // Batch counts
    const memberCounts = await this.memberRepo
      .createQueryBuilder('m')
      .select('m.spaceId', 'spaceId')
      .addSelect('COUNT(*)', 'count')
      .where('m.spaceId IN (:...ids)', { ids: spaceIds })
      .groupBy('m.spaceId')
      .getRawMany<{ spaceId: string; count: string }>();

    const mediaCounts = await this.mediaRepo
      .createQueryBuilder('media')
      .select('media.storageSpaceId', 'spaceId')
      .addSelect('COUNT(*)', 'count')
      .where('media.storageSpaceId IN (:...ids)', { ids: spaceIds })
      .andWhere('media.deletedAt IS NULL')
      .groupBy('media.storageSpaceId')
      .getRawMany<{ spaceId: string; count: string }>();

    const memberCountMap = new Map(memberCounts.map((r) => [r.spaceId, parseInt(r.count, 10)]));
    const mediaCountMap = new Map(mediaCounts.map((r) => [r.spaceId, parseInt(r.count, 10)]));

    return [...spaceMap.values()].map(({ space, role }) => {
      const isOwner = space.ownerId === userId;
      const myRole: 'owner' | 'editor' | 'viewer' = isOwner
        ? 'owner'
        : (role as 'editor' | 'viewer');
      const dto = new StorageSpaceResponseDto();
      dto.id = space.id;
      dto.name = space.name;
      dto.isOwner = isOwner;
      dto.myRole = myRole;
      dto.memberCount = memberCountMap.get(space.id) ?? 0;
      dto.mediaCount = mediaCountMap.get(space.id) ?? 0;
      dto.createdAt = space.createdAt;
      dto.updatedAt = space.updatedAt;
      return dto;
    });
  }

  // ── Get one ───────────────────────────────────────────────────────────────

  async findOneForUser(spaceId: string, userId: string): Promise<StorageSpaceDetailResponseDto> {
    const space = await this.spaceRepo.findOne({
      where: { id: spaceId },
      relations: ['owner', 'members', 'members.user'],
    });

    if (!space) throw new NotFoundException('Storage space not found');

    const isOwner = space.ownerId === userId;
    const memberRow = space.members.find((m) => m.userId === userId);

    if (!isOwner && !memberRow) {
      throw new ForbiddenException('You do not have access to this storage space');
    }

    const mediaCount = await this.mediaRepo.count({
      where: { storageSpaceId: spaceId, deletedAt: IsNull() },
    });

    const myRole: 'owner' | 'editor' | 'viewer' = isOwner
      ? 'owner'
      : (memberRow?.role as 'editor' | 'viewer');

    const dto = new StorageSpaceDetailResponseDto();
    dto.id = space.id;
    dto.name = space.name;
    dto.myRole = myRole;
    dto.owner = {
      id: space.owner.id,
      fullName: space.owner.fullName,
      email: space.owner.email,
    };
    dto.members = space.members.map((m) => this.toMemberResponse(m));
    dto.mediaCount = mediaCount;
    dto.createdAt = space.createdAt;
    dto.updatedAt = space.updatedAt;
    return dto;
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async update(
    spaceId: string,
    ownerId: string,
    dto: UpdateStorageSpaceDto,
  ): Promise<StorageSpaceResponseDto> {
    const space = await this.spaceRepo.findOne({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Storage space not found');
    if (space.ownerId !== ownerId)
      throw new ForbiddenException('Only the owner can update this space');

    if (dto.name !== undefined) space.name = dto.name;
    const saved = await this.spaceRepo.save(space);
    return this.toSpaceResponse(saved, ownerId);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async remove(spaceId: string, ownerId: string): Promise<void> {
    const space = await this.spaceRepo.findOne({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Storage space not found');
    if (space.ownerId !== ownerId)
      throw new ForbiddenException('Only the owner can delete this space');

    // Nullify media references before deleting (SET NULL FK handles it at DB
    // level, but we do it explicitly to be safe with soft-deleted rows too)
    await this.mediaRepo.update({ storageSpaceId: spaceId }, { storageSpaceId: null });

    // Remove member rows then the space itself
    await this.memberRepo.delete({ spaceId });
    await this.spaceRepo.remove(space);
  }

  // ── Members ───────────────────────────────────────────────────────────────

  async addMember(
    spaceId: string,
    ownerId: string,
    dto: AddStorageSpaceMemberDto,
  ): Promise<StorageSpaceMemberResponseDto> {
    const space = await this.spaceRepo.findOne({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Storage space not found');
    if (space.ownerId !== ownerId) throw new ForbiddenException('Only the owner can add members');

    const targetUser = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!targetUser) throw new NotFoundException('User not found');
    if (dto.userId === ownerId) {
      throw new ConflictException('Owner cannot be added as a member');
    }

    const existing = await this.memberRepo.findOne({
      where: { spaceId, userId: dto.userId },
    });
    if (existing) throw new ConflictException('User is already a member of this space');

    const member = this.memberRepo.create({
      spaceId,
      userId: dto.userId,
      role: dto.role,
    });
    const saved = await this.memberRepo.save(member);
    return this.toMemberResponse(saved, targetUser);
  }

  async updateMemberRole(
    spaceId: string,
    ownerId: string,
    memberUserId: string,
    dto: UpdateStorageSpaceMemberRoleDto,
  ): Promise<StorageSpaceMemberResponseDto> {
    const space = await this.spaceRepo.findOne({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Storage space not found');
    if (space.ownerId !== ownerId)
      throw new ForbiddenException('Only the owner can update member roles');
    if (memberUserId === ownerId)
      throw new ForbiddenException('Cannot change the role of the owner');

    const member = await this.memberRepo.findOne({
      where: { spaceId, userId: memberUserId },
      relations: ['user'],
    });
    if (!member) throw new NotFoundException('Member not found');

    member.role = dto.role;
    const saved = await this.memberRepo.save(member);
    return this.toMemberResponse(saved, saved.user);
  }

  async removeMember(spaceId: string, ownerId: string, memberUserId: string): Promise<void> {
    const space = await this.spaceRepo.findOne({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Storage space not found');
    if (space.ownerId !== ownerId)
      throw new ForbiddenException('Only the owner can remove members');
    if (memberUserId === ownerId) throw new ForbiddenException('Cannot remove the owner');

    const member = await this.memberRepo.findOne({
      where: { spaceId, userId: memberUserId },
    });
    if (!member) throw new NotFoundException('Member not found');

    await this.memberRepo.remove(member);
  }

  // ── Media assignment ──────────────────────────────────────────────────────

  async assignMedia(
    spaceId: string,
    actorUserId: string,
    dto: AssignMediaToSpaceDto,
  ): Promise<{ updated: number }> {
    const space = await this.spaceRepo.findOne({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Storage space not found');

    // Verify actor has at least editor access (guard also checks, but be defensive)
    const actor = await this.resolveActor(spaceId, actorUserId);
    if (!actor) throw new ForbiddenException();
    if (!actor.isOwner && actor.role === StorageSpaceMemberRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot assign media to a space');
    }

    // Only allow assigning media owned by the acting user
    const mediaItems = await this.mediaRepo.find({
      where: { id: In(dto.mediaIds), ownerId: actorUserId },
    });

    if (mediaItems.length === 0) return { updated: 0 };

    await this.mediaRepo.update(
      { id: In(mediaItems.map((m) => m.id)) },
      { storageSpaceId: spaceId },
    );

    return { updated: mediaItems.length };
  }

  // ── resolveActor ──────────────────────────────────────────────────────────

  async resolveActor(spaceId: string, userId: string): Promise<SpaceActor | null> {
    const space = await this.spaceRepo.findOne({ where: { id: spaceId } });
    if (!space) return null;

    if (space.ownerId === userId) {
      return { userId, isOwner: true, role: null };
    }

    const member = await this.memberRepo.findOne({ where: { spaceId, userId } });
    if (!member) return null;

    return { userId, isOwner: false, role: member.role };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private toSpaceResponse(space: StorageSpace, userId: string): StorageSpaceResponseDto {
    const dto = new StorageSpaceResponseDto();
    dto.id = space.id;
    dto.name = space.name;
    dto.isOwner = space.ownerId === userId;
    dto.myRole = 'owner';
    dto.memberCount = 0;
    dto.mediaCount = 0;
    dto.createdAt = space.createdAt;
    dto.updatedAt = space.updatedAt;
    return dto;
  }

  private toMemberResponse(member: StorageMember, user?: User): StorageSpaceMemberResponseDto {
    const dto = new StorageSpaceMemberResponseDto();
    dto.spaceId = member.spaceId;
    dto.userId = member.userId;
    dto.role = member.role;
    dto.addedAt = member.addedAt;
    const resolvedUser = user ?? member.user;
    if (resolvedUser) {
      dto.user = {
        id: resolvedUser.id,
        fullName: resolvedUser.fullName,
        email: resolvedUser.email,
      };
    }
    return dto;
  }
}
