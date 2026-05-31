import { StorageSpaceMember } from './storage-space-member.model';

export interface StorageSpaceDetail {
  id: string;
  name: string;
  myRole: 'owner' | 'editor' | 'viewer';
  owner: {
    id: string;
    fullName: string;
    email: string;
  };
  members: StorageSpaceMember[];
  mediaCount: number;
  createdAt: string;
  updatedAt: string;
}
