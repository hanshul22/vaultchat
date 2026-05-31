import { SetMetadata } from '@nestjs/common';
import { StorageSpaceMemberRole } from '../enums/storage-space-member-role.enum';

export const SPACE_ROLE_KEY = 'spaceRoles';

/**
 * Declares the minimum member roles allowed to access a route.
 * The owner is always allowed regardless of this decorator.
 *
 * Usage: @RequireSpaceRole(StorageSpaceMemberRole.EDITOR)
 */
export const RequireSpaceRole = (...roles: StorageSpaceMemberRole[]) =>
  SetMetadata(SPACE_ROLE_KEY, roles);
