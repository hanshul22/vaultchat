import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Media } from '../media/entities/media.entity';
import { User } from '../users/entities/user.entity';
import { AddStorageSpaceMemberDto } from './dto/add-storage-space-member.dto';
import { AssignMediaToSpaceDto } from './dto/assign-media-to-space.dto';
import { StorageMember, StorageMemberRole } from './entities/storage-member.entity';
import { StorageSpace } from './entities/storage-space.entity';
import { StorageSpaceMemberRole } from './enums/storage-space-member-role.enum';
import { StorageSpacesService } from './storage-spaces.service';

// ── Minimal mock factory ──────────────────────────────────────────────────────

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OWNER_ID = 'owner-uuid';
const MEMBER_ID = 'member-uuid';
const SPACE_ID = 'space-uuid';

const makeSpace = (overrides: Partial<StorageSpace> = {}): StorageSpace =>
  ({
    id: SPACE_ID,
    ownerId: OWNER_ID,
    name: 'Test Space',
    description: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    members: [],
    media: [],
    owner: { id: OWNER_ID, fullName: 'Owner', email: 'owner@test.com' } as User,
    ...overrides,
  }) as StorageSpace;

const makeUser = (id: string): User =>
  ({ id, fullName: 'Test User', email: `${id}@test.com` }) as User;

const makeMember = (userId: string, role: StorageMemberRole): StorageMember =>
  ({
    spaceId: SPACE_ID,
    userId,
    role,
    addedAt: new Date('2024-01-01'),
    user: makeUser(userId),
  }) as StorageMember;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StorageSpacesService', () => {
  let service: StorageSpacesService;
  let spaceRepo: ReturnType<typeof mockRepo>;
  let memberRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;
  let mediaRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    spaceRepo = mockRepo();
    memberRepo = mockRepo();
    userRepo = mockRepo();
    mediaRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageSpacesService,
        { provide: getRepositoryToken(StorageSpace), useValue: spaceRepo },
        { provide: getRepositoryToken(StorageMember), useValue: memberRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Media), useValue: mediaRepo },
      ],
    }).compile();

    service = module.get<StorageSpacesService>(StorageSpacesService);
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('owner can create a space', async () => {
      const space = makeSpace();
      spaceRepo.create.mockReturnValue(space);
      spaceRepo.save.mockResolvedValue(space);

      const result = await service.create(OWNER_ID, { name: 'Test Space' });

      expect(spaceRepo.create).toHaveBeenCalledWith({
        ownerId: OWNER_ID,
        name: 'Test Space',
        description: null,
      });
      expect(result.id).toBe(SPACE_ID);
      expect(result.isOwner).toBe(true);
      expect(result.myRole).toBe('owner');
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('owner can rename a space', async () => {
      const space = makeSpace();
      spaceRepo.findOne.mockResolvedValue(space);
      spaceRepo.save.mockResolvedValue({ ...space, name: 'Renamed' });

      const result = await service.update(SPACE_ID, OWNER_ID, { name: 'Renamed' });

      expect(result.name).toBe('Renamed');
    });

    it('non-owner gets 403', async () => {
      spaceRepo.findOne.mockResolvedValue(makeSpace());

      await expect(service.update(SPACE_ID, 'other-user', { name: 'X' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('owner can delete a space', async () => {
      const space = makeSpace();
      spaceRepo.findOne.mockResolvedValue(space);
      mediaRepo.update.mockResolvedValue({ affected: 0 });
      memberRepo.delete.mockResolvedValue({ affected: 0 });
      spaceRepo.remove.mockResolvedValue(space);

      await expect(service.remove(SPACE_ID, OWNER_ID)).resolves.toBeUndefined();
      expect(mediaRepo.update).toHaveBeenCalledWith(
        { storageSpaceId: SPACE_ID },
        { storageSpaceId: null },
      );
    });

    it('non-owner gets 403', async () => {
      spaceRepo.findOne.mockResolvedValue(makeSpace());

      await expect(service.remove(SPACE_ID, 'other-user')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── addMember ────────────────────────────────────────────────────────────────

  describe('addMember', () => {
    it('owner can add a member', async () => {
      const space = makeSpace();
      const targetUser = makeUser(MEMBER_ID);
      const member = makeMember(MEMBER_ID, StorageMemberRole.EDITOR);

      spaceRepo.findOne.mockResolvedValue(space);
      userRepo.findOne.mockResolvedValue(targetUser);
      memberRepo.findOne.mockResolvedValue(null);
      memberRepo.create.mockReturnValue(member);
      memberRepo.save.mockResolvedValue(member);

      const dto: AddStorageSpaceMemberDto = {
        userId: MEMBER_ID,
        role: StorageSpaceMemberRole.EDITOR,
      };
      const result = await service.addMember(SPACE_ID, OWNER_ID, dto);

      expect(result.userId).toBe(MEMBER_ID);
      expect(result.role).toBe(StorageMemberRole.EDITOR);
    });

    it('non-owner gets 403 when adding member', async () => {
      spaceRepo.findOne.mockResolvedValue(makeSpace());

      const dto: AddStorageSpaceMemberDto = {
        userId: MEMBER_ID,
        role: StorageSpaceMemberRole.EDITOR,
      };
      await expect(service.addMember(SPACE_ID, 'other-user', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('duplicate member add returns 409', async () => {
      const space = makeSpace();
      const targetUser = makeUser(MEMBER_ID);
      const existingMember = makeMember(MEMBER_ID, StorageMemberRole.VIEWER);

      spaceRepo.findOne.mockResolvedValue(space);
      userRepo.findOne.mockResolvedValue(targetUser);
      memberRepo.findOne.mockResolvedValue(existingMember);

      const dto: AddStorageSpaceMemberDto = {
        userId: MEMBER_ID,
        role: StorageSpaceMemberRole.EDITOR,
      };
      await expect(service.addMember(SPACE_ID, OWNER_ID, dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── updateMemberRole ─────────────────────────────────────────────────────────

  describe('updateMemberRole', () => {
    it('owner can update member role', async () => {
      const space = makeSpace();
      const member = makeMember(MEMBER_ID, StorageMemberRole.VIEWER);
      const updated = { ...member, role: StorageMemberRole.EDITOR };

      spaceRepo.findOne.mockResolvedValue(space);
      memberRepo.findOne.mockResolvedValue(member);
      memberRepo.save.mockResolvedValue(updated);

      const result = await service.updateMemberRole(SPACE_ID, OWNER_ID, MEMBER_ID, {
        role: StorageSpaceMemberRole.EDITOR,
      });

      expect(result.role).toBe(StorageMemberRole.EDITOR);
    });

    it('non-owner gets 403 when updating member role', async () => {
      spaceRepo.findOne.mockResolvedValue(makeSpace());

      await expect(
        service.updateMemberRole(SPACE_ID, 'other-user', MEMBER_ID, {
          role: StorageSpaceMemberRole.EDITOR,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── removeMember ─────────────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('owner can remove a member', async () => {
      const space = makeSpace();
      const member = makeMember(MEMBER_ID, StorageMemberRole.EDITOR);

      spaceRepo.findOne.mockResolvedValue(space);
      memberRepo.findOne.mockResolvedValue(member);
      memberRepo.remove.mockResolvedValue(member);

      await expect(service.removeMember(SPACE_ID, OWNER_ID, MEMBER_ID)).resolves.toBeUndefined();
    });

    it('non-owner gets 403 when removing member', async () => {
      spaceRepo.findOne.mockResolvedValue(makeSpace());

      await expect(service.removeMember(SPACE_ID, 'other-user', MEMBER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── assignMedia ───────────────────────────────────────────────────────────────

  describe('assignMedia', () => {
    const dto: AssignMediaToSpaceDto = { mediaIds: ['media-1', 'media-2'] };

    it('editor can assign media', async () => {
      const EDITOR_ID = 'editor-uuid';
      spaceRepo.findOne.mockResolvedValueOnce(makeSpace()).mockResolvedValueOnce(makeSpace());
      memberRepo.findOne.mockResolvedValue(makeMember(EDITOR_ID, StorageMemberRole.EDITOR));

      const mediaItems = [{ id: 'media-1', ownerId: EDITOR_ID }];
      mediaRepo.find.mockResolvedValue(mediaItems);
      mediaRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.assignMedia(SPACE_ID, EDITOR_ID, dto);
      expect(result.updated).toBe(1);
    });

    it('viewer gets 403 when assigning media', async () => {
      const VIEWER_ID = 'viewer-uuid';
      spaceRepo.findOne.mockResolvedValueOnce(makeSpace()).mockResolvedValueOnce(makeSpace());
      memberRepo.findOne.mockResolvedValue(makeMember(VIEWER_ID, StorageMemberRole.VIEWER));

      await expect(service.assignMedia(SPACE_ID, VIEWER_ID, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('owner can assign media', async () => {
      spaceRepo.findOne.mockResolvedValueOnce(makeSpace()).mockResolvedValueOnce(makeSpace());
      // resolveActor: owner check passes, no memberRepo call needed
      const mediaItems = [{ id: 'media-1', ownerId: OWNER_ID }];
      mediaRepo.find.mockResolvedValue(mediaItems);
      mediaRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.assignMedia(SPACE_ID, OWNER_ID, dto);
      expect(result.updated).toBe(1);
    });

    it('returns updated = 0 when no media owned by the actor matches', async () => {
      spaceRepo.findOne.mockResolvedValueOnce(makeSpace()).mockResolvedValueOnce(makeSpace());
      // resolveActor: owner
      mediaRepo.find.mockResolvedValue([]); // none owned by actor

      const result = await service.assignMedia(SPACE_ID, OWNER_ID, dto);
      expect(result.updated).toBe(0);
      expect(mediaRepo.update).not.toHaveBeenCalled();
    });

    it('non-member/non-owner gets ForbiddenException', async () => {
      const STRANGER_ID = 'stranger-uuid';
      // First findOne for the space existence check, second for resolveActor
      spaceRepo.findOne.mockResolvedValueOnce(makeSpace()).mockResolvedValueOnce(makeSpace());
      memberRepo.findOne.mockResolvedValue(null); // not a member

      await expect(service.assignMedia(SPACE_ID, STRANGER_ID, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('missing space returns NotFoundException', async () => {
      spaceRepo.findOne.mockResolvedValue(null);

      await expect(service.assignMedia(SPACE_ID, OWNER_ID, dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ── findAllForUser ────────────────────────────────────────────────────────

  describe('findAllForUser', () => {
    it('returns owned spaces with isOwner = true and myRole = owner', async () => {
      const space = makeSpace();
      spaceRepo.find.mockResolvedValue([space]);
      memberRepo.find.mockResolvedValue([]);

      // createQueryBuilder chain for memberCounts and mediaCounts
      const qbMock = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      spaceRepo.createQueryBuilder = jest.fn().mockReturnValue(qbMock);
      memberRepo.createQueryBuilder = jest.fn().mockReturnValue(qbMock);
      mediaRepo.createQueryBuilder = jest.fn().mockReturnValue(qbMock);

      const results = await service.findAllForUser(OWNER_ID);

      expect(results).toHaveLength(1);
      expect(results[0].isOwner).toBe(true);
      expect(results[0].myRole).toBe('owner');
    });

    it('returns member spaces with isOwner = false and myRole equal to membership role', async () => {
      const space = makeSpace({ ownerId: 'other-owner' });
      const membership = {
        userId: MEMBER_ID,
        spaceId: SPACE_ID,
        role: StorageMemberRole.EDITOR,
        storageSpace: space,
      };
      spaceRepo.find.mockResolvedValue([]); // no owned spaces
      memberRepo.find.mockResolvedValue([membership]);

      const qbMock = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      spaceRepo.createQueryBuilder = jest.fn().mockReturnValue(qbMock);
      memberRepo.createQueryBuilder = jest.fn().mockReturnValue(qbMock);
      mediaRepo.createQueryBuilder = jest.fn().mockReturnValue(qbMock);

      const results = await service.findAllForUser(MEMBER_ID);

      expect(results).toHaveLength(1);
      expect(results[0].isOwner).toBe(false);
      expect(results[0].myRole).toBe('editor');
    });

    it('handles empty results cleanly', async () => {
      spaceRepo.find.mockResolvedValue([]);
      memberRepo.find.mockResolvedValue([]);

      const results = await service.findAllForUser(OWNER_ID);

      expect(results).toEqual([]);
    });
  });

  // ── findOneForUser ────────────────────────────────────────────────────────

  describe('findOneForUser', () => {
    it('owner can fetch a space detail result', async () => {
      const space = makeSpace();
      spaceRepo.findOne.mockResolvedValue(space);
      mediaRepo.count.mockResolvedValue(3);

      const result = await service.findOneForUser(SPACE_ID, OWNER_ID);

      expect(result.id).toBe(SPACE_ID);
      expect(result.myRole).toBe('owner');
      expect(result.mediaCount).toBe(3);
    });

    it('member can fetch a space detail result', async () => {
      const member = makeMember(MEMBER_ID, StorageMemberRole.VIEWER);
      const space = makeSpace({ members: [member] });
      spaceRepo.findOne.mockResolvedValue(space);
      mediaRepo.count.mockResolvedValue(0);

      const result = await service.findOneForUser(SPACE_ID, MEMBER_ID);

      expect(result.myRole).toBe('viewer');
    });

    it('non-member/non-owner gets ForbiddenException', async () => {
      const space = makeSpace({ members: [] });
      spaceRepo.findOne.mockResolvedValue(space);

      await expect(service.findOneForUser(SPACE_ID, 'stranger-uuid')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('missing space returns NotFoundException', async () => {
      spaceRepo.findOne.mockResolvedValue(null);

      await expect(service.findOneForUser(SPACE_ID, OWNER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── addMember — additional paths ──────────────────────────────────────────

  describe('addMember — additional paths', () => {
    it('target user not found returns NotFoundException', async () => {
      spaceRepo.findOne.mockResolvedValue(makeSpace());
      userRepo.findOne.mockResolvedValue(null); // user does not exist

      const dto: AddStorageSpaceMemberDto = {
        userId: 'nonexistent-user',
        role: StorageSpaceMemberRole.EDITOR,
      };
      await expect(service.addMember(SPACE_ID, OWNER_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('owner cannot add themselves as a member (ConflictException)', async () => {
      spaceRepo.findOne.mockResolvedValue(makeSpace());
      userRepo.findOne.mockResolvedValue(makeUser(OWNER_ID));

      const dto: AddStorageSpaceMemberDto = {
        userId: OWNER_ID, // same as ownerId
        role: StorageSpaceMemberRole.EDITOR,
      };
      await expect(service.addMember(SPACE_ID, OWNER_ID, dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── updateMemberRole — additional paths ───────────────────────────────────

  describe('updateMemberRole — additional paths', () => {
    it('missing member returns NotFoundException', async () => {
      spaceRepo.findOne.mockResolvedValue(makeSpace());
      memberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateMemberRole(SPACE_ID, OWNER_ID, 'ghost-user', {
          role: StorageSpaceMemberRole.EDITOR,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('attempting to update the owner via member record path is rejected (ForbiddenException)', async () => {
      spaceRepo.findOne.mockResolvedValue(makeSpace());

      await expect(
        service.updateMemberRole(SPACE_ID, OWNER_ID, OWNER_ID, {
          role: StorageSpaceMemberRole.EDITOR,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── removeMember — additional paths ──────────────────────────────────────

  describe('removeMember — additional paths', () => {
    it('missing member returns NotFoundException', async () => {
      spaceRepo.findOne.mockResolvedValue(makeSpace());
      memberRepo.findOne.mockResolvedValue(null);

      await expect(service.removeMember(SPACE_ID, OWNER_ID, 'ghost-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
