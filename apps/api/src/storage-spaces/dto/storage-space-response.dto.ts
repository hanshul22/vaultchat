export class UserSummaryDto {
  id!: string;
  fullName!: string;
  email!: string;
}

export class StorageSpaceResponseDto {
  id!: string;
  name!: string;
  isOwner!: boolean;
  myRole!: 'owner' | 'editor' | 'viewer';
  memberCount!: number;
  mediaCount!: number;
  createdAt!: Date;
  updatedAt!: Date;
}
