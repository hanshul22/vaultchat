export interface StorageSpaceMember {
  spaceId: string;
  userId: string;
  role: 'editor' | 'viewer';
  addedAt: string;
  user?: {
    id: string;
    fullName: string;
    email: string;
  };
}
