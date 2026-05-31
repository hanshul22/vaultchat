import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JwtPayload } from '../../auth/guards/jwt-access.guard';
import { SPACE_ROLE_KEY } from '../decorators/require-space-role.decorator';
import { StorageSpaceMemberRole } from '../enums/storage-space-member-role.enum';
import { StorageSpacesService } from '../storage-spaces.service';

@Injectable()
export class SpaceRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly storageSpacesService: StorageSpacesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<StorageSpaceMemberRole[]>(
      SPACE_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();

    const userId = request.user?.sub;
    if (!userId) throw new ForbiddenException();

    const params = request.params as Record<string, string>;
    const spaceId = params['spaceId'] ?? params['id'];
    if (!spaceId) throw new ForbiddenException();

    const actor = await this.storageSpacesService.resolveActor(spaceId, userId);

    if (!actor) {
      // Distinguish "space not found" from "no access" only when the space
      // truly doesn't exist; otherwise return 403 to avoid enumeration.
      throw new NotFoundException('Storage space not found');
    }

    // Owner always passes.
    if (actor.isOwner) return true;

    // No required roles declared — any authenticated member passes.
    if (!requiredRoles || requiredRoles.length === 0) return true;

    if (actor.role && requiredRoles.includes(actor.role)) return true;

    throw new ForbiddenException('You do not have the required role for this action');
  }
}
