import { StorageSpaceMemberRole } from '../enums/storage-space-member-role.enum';

/**
 * Describes the resolved actor for a given space request.
 * Returned by StorageSpacesService.resolveActor().
 */
export interface SpaceActor {
  userId: string;
  isOwner: boolean;
  /** null when the user is the owner (owner has no member row) */
  role: StorageSpaceMemberRole | null;
}
