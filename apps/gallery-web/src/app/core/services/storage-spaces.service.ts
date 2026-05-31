import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { StorageSpaceDetail } from '../models/storage-space-detail.model';
import { StorageSpaceMember } from '../models/storage-space-member.model';
import { StorageSpaceMediaAssignment } from '../models/storage-space-media-assignment.model';
import { StorageSpace } from '../models/storage-space.model';

const BASE = '/api/v1/storage-spaces';

@Injectable({ providedIn: 'root' })
export class StorageSpacesService {
  private readonly http = inject(HttpClient);

  listSpaces(): Observable<StorageSpace[]> {
    return this.http.get<StorageSpace[]>(BASE);
  }

  getSpace(id: string): Observable<StorageSpaceDetail> {
    return this.http.get<StorageSpaceDetail>(`${BASE}/${id}`);
  }

  createSpace(name: string): Observable<StorageSpace> {
    return this.http.post<StorageSpace>(BASE, { name });
  }

  renameSpace(id: string, name: string): Observable<StorageSpace> {
    return this.http.patch<StorageSpace>(`${BASE}/${id}`, { name });
  }

  addMember(
    spaceId: string,
    userId: string,
    role: 'editor' | 'viewer',
  ): Observable<StorageSpaceMember> {
    return this.http.post<StorageSpaceMember>(`${BASE}/${spaceId}/members`, { userId, role });
  }

  updateMemberRole(
    spaceId: string,
    memberUserId: string,
    role: 'editor' | 'viewer',
  ): Observable<StorageSpaceMember> {
    return this.http.patch<StorageSpaceMember>(`${BASE}/${spaceId}/members/${memberUserId}`, {
      role,
    });
  }

  removeMember(spaceId: string, memberUserId: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/${spaceId}/members/${memberUserId}`);
  }

  assignMedia(spaceId: string, mediaIds: string[]): Observable<StorageSpaceMediaAssignment> {
    return this.http.post<StorageSpaceMediaAssignment>(`${BASE}/${spaceId}/media`, { mediaIds });
  }
}
