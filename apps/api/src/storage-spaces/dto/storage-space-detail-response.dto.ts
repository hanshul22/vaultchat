import { StorageSpaceMemberResponseDto } from './storage-space-member-response.dto';

export class StorageSpaceDetailResponseDto {
  id!: string;
  name!: string;
  myRole!: 'owner' | 'editor' | 'viewer';
  owner!: {
    id: string;
    fullName: string;
    email: string;
  };
  members!: StorageSpaceMemberResponseDto[];
  mediaCount!: number;
  createdAt!: Date;
  updatedAt!: Date;
}
