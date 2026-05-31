import { IsEnum } from 'class-validator';
import { StorageSpaceMemberRole } from '../enums/storage-space-member-role.enum';

export class UpdateStorageSpaceMemberRoleDto {
  @IsEnum(StorageSpaceMemberRole)
  role!: StorageSpaceMemberRole;
}
