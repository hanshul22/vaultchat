import { StorageSpaceMemberRole } from '../enums/storage-space-member-role.enum';

export class StorageSpaceMemberResponseDto {
  spaceId!: string;
  userId!: string;
  role!: StorageSpaceMemberRole;
  addedAt!: Date;
  user?: {
    id: string;
    fullName: string;
    email: string;
  };
}
