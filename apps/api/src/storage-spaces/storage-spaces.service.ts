import { Injectable, NotImplementedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StorageMember } from './entities/storage-member.entity';
import { StorageSpace } from './entities/storage-space.entity';
import { AddStorageSpaceMemberDto } from './dto/add-storage-space-member.dto';
import { AssignMediaToSpaceDto } from './dto/assign-media-to-space.dto';
import { CreateStorageSpaceDto } from './dto/create-storage-space.dto';
import { ListStorageSpacesQueryDto } from './dto/list-storage-spaces-query.dto';
import { UpdateStorageSpaceDto } from './dto/update-storage-space.dto';
import { UpdateStorageSpaceMemberRoleDto } from './dto/update-storage-space-member-role.dto';
import { SpaceActor } from './interfaces/space-actor.interface';

@Injectable()
export class StorageSpacesService {
  constructor(
    @InjectRepository(StorageSpace)
    private readonly spaceRepo: Repository<StorageSpace>,
    @InjectRepository(StorageMember)
    private readonly memberRepo: Repository<StorageMember>,
  ) {}

  create(_ownerId: string, _dto: CreateStorageSpaceDto): Promise<StorageSpace> {
    throw new NotImplementedException();
  }

  findAllForUser(_userId: string, _query?: ListStorageSpacesQueryDto): Promise<StorageSpace[]> {
    throw new NotImplementedException();
  }

  findOneForUser(_spaceId: string, _userId: string): Promise<StorageSpace> {
    throw new NotImplementedException();
  }

  update(_spaceId: string, _ownerId: string, _dto: UpdateStorageSpaceDto): Promise<StorageSpace> {
    throw new NotImplementedException();
  }

  remove(_spaceId: string, _ownerId: string): Promise<void> {
    throw new NotImplementedException();
  }

  addMember(
    _spaceId: string,
    _ownerId: string,
    _dto: AddStorageSpaceMemberDto,
  ): Promise<StorageMember> {
    throw new NotImplementedException();
  }

  updateMemberRole(
    _spaceId: string,
    _ownerId: string,
    _memberUserId: string,
    _dto: UpdateStorageSpaceMemberRoleDto,
  ): Promise<StorageMember> {
    throw new NotImplementedException();
  }

  removeMember(_spaceId: string, _ownerId: string, _memberUserId: string): Promise<void> {
    throw new NotImplementedException();
  }

  assignMedia(_spaceId: string, _actorUserId: string, _dto: AssignMediaToSpaceDto): Promise<void> {
    throw new NotImplementedException();
  }

  /**
   * Resolves the acting user's relationship to a space.
   * Returns null if the space does not exist or the user has no access.
   *
   * Owner check is done first (no member row needed).
   * Falls back to a member row lookup for EDITOR/VIEWER.
   */
  async resolveActor(spaceId: string, userId: string): Promise<SpaceActor | null> {
    const space = await this.spaceRepo.findOne({ where: { id: spaceId } });
    if (!space) return null;

    if (space.ownerId === userId) {
      return { userId, isOwner: true, role: null };
    }

    const member = await this.memberRepo.findOne({
      where: { spaceId, userId },
    });
    if (!member) return null;

    return { userId, isOwner: false, role: member.role };
  }
}
