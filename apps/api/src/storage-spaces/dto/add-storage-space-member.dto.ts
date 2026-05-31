import { IsEnum, IsUUID } from 'class-validator';
import { StorageSpaceMemberRole } from '../enums/storage-space-member-role.enum';

export class AddStorageSpaceMemberDto {
  @IsUUID()
  userId!: string;

  /** Only EDITOR or VIEWER — owner is tracked on the space row, not here. */
  @IsEnum(StorageSpaceMemberRole)
  role!: StorageSpaceMemberRole;
}
