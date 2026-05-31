export interface StorageSpace {
  id: string;
  name: string;
  isOwner: boolean;
  myRole: 'owner' | 'editor' | 'viewer';
  memberCount: number;
  mediaCount: number;
  createdAt: string;
  updatedAt: string;
}
