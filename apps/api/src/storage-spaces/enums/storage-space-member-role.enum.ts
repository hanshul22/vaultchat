/**
 * Re-export the canonical role enum from the entity so other modules
 * can import from a stable enum-only path without pulling in the full entity.
 */
export { StorageMemberRole as StorageSpaceMemberRole } from '../entities/storage-member.entity';
