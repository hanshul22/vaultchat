import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { StorageMemberRole } from '../entities/storage-member.entity';
import { StorageSpaceMemberRole } from '../enums/storage-space-member-role.enum';
import { SpaceActor } from '../interfaces/space-actor.interface';
import { StorageSpacesService } from '../storage-spaces.service';
import { SpaceRoleGuard } from './space-role.guard';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SPACE_ID = 'space-uuid';
const USER_ID = 'user-uuid';

function makeContext(overrides: {
  userId?: string | null;
  spaceId?: string | null;
  paramKey?: 'spaceId' | 'id';
  requiredRoles?: StorageSpaceMemberRole[];
}): ExecutionContext {
  const { userId, spaceId, paramKey = 'id', requiredRoles } = overrides;

  const request = {
    user: userId !== null ? { sub: userId ?? USER_ID } : undefined,
    params: spaceId !== null ? { [paramKey]: spaceId ?? SPACE_ID } : {},
  };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
    // Reflector is injected separately; this is just the context shape.
    _requiredRoles: requiredRoles,
  } as unknown as ExecutionContext;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SpaceRoleGuard', () => {
  let guard: SpaceRoleGuard;
  let reflector: jest.Mocked<Reflector>;
  let spacesService: jest.Mocked<Pick<StorageSpacesService, 'resolveActor'>>;

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    spacesService = {
      resolveActor: jest.fn(),
    } as unknown as jest.Mocked<Pick<StorageSpacesService, 'resolveActor'>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpaceRoleGuard,
        { provide: Reflector, useValue: reflector },
        { provide: StorageSpacesService, useValue: spacesService },
      ],
    }).compile();

    guard = module.get<SpaceRoleGuard>(SpaceRoleGuard);
  });

  // ── No authenticated user ─────────────────────────────────────────────────

  it('throws ForbiddenException when no authenticated user is on the request', async () => {
    const ctx = makeContext({ userId: null });
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ── No spaceId param ──────────────────────────────────────────────────────

  it('throws ForbiddenException when no spaceId/id param is present', async () => {
    const ctx = makeContext({ spaceId: null });
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ── resolveActor returns null (space not found) ───────────────────────────

  it('throws NotFoundException when resolveActor returns null', async () => {
    const ctx = makeContext({});
    reflector.getAllAndOverride.mockReturnValue(undefined);
    spacesService.resolveActor.mockResolvedValue(null);

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });

  // ── Owner always passes ───────────────────────────────────────────────────

  it('returns true for owner regardless of required role', async () => {
    const ctx = makeContext({});
    reflector.getAllAndOverride.mockReturnValue([StorageSpaceMemberRole.EDITOR]);
    const actor: SpaceActor = { userId: USER_ID, isOwner: true, role: null };
    spacesService.resolveActor.mockResolvedValue(actor);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ── Member with matching role ─────────────────────────────────────────────

  it('returns true for member with required role', async () => {
    const ctx = makeContext({});
    reflector.getAllAndOverride.mockReturnValue([StorageSpaceMemberRole.EDITOR]);
    const actor: SpaceActor = {
      userId: USER_ID,
      isOwner: false,
      role: StorageMemberRole.EDITOR,
    };
    spacesService.resolveActor.mockResolvedValue(actor);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ── No required roles declared — any member passes ────────────────────────

  it('returns true when no required role metadata is declared and the actor is a member', async () => {
    const ctx = makeContext({});
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const actor: SpaceActor = {
      userId: USER_ID,
      isOwner: false,
      role: StorageMemberRole.VIEWER,
    };
    spacesService.resolveActor.mockResolvedValue(actor);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('returns true when required roles array is empty and the actor is a member', async () => {
    const ctx = makeContext({});
    reflector.getAllAndOverride.mockReturnValue([]);
    const actor: SpaceActor = {
      userId: USER_ID,
      isOwner: false,
      role: StorageMemberRole.VIEWER,
    };
    spacesService.resolveActor.mockResolvedValue(actor);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ── Insufficient role ─────────────────────────────────────────────────────

  it('throws ForbiddenException when the actor role is insufficient', async () => {
    const ctx = makeContext({});
    reflector.getAllAndOverride.mockReturnValue([StorageSpaceMemberRole.EDITOR]);
    const actor: SpaceActor = {
      userId: USER_ID,
      isOwner: false,
      role: StorageMemberRole.VIEWER,
    };
    spacesService.resolveActor.mockResolvedValue(actor);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ── spaceId param variant ─────────────────────────────────────────────────

  it('resolves spaceId from the "spaceId" param key', async () => {
    const ctx = makeContext({ paramKey: 'spaceId' });
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const actor: SpaceActor = { userId: USER_ID, isOwner: true, role: null };
    spacesService.resolveActor.mockResolvedValue(actor);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(spacesService.resolveActor).toHaveBeenCalledWith(SPACE_ID, USER_ID);
  });
});
