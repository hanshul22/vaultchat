import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { StorageSpaceDetail } from '../../core/models/storage-space-detail.model';
import { StorageSpaceMember } from '../../core/models/storage-space-member.model';
import { StorageSpacesService } from '../../core/services/storage-spaces.service';

@Component({
  selector: 'app-shared-space-detail-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './shared-space-detail-page.component.html',
  styleUrl: './shared-space-detail-page.component.scss',
})
export class SharedSpaceDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly spacesService = inject(StorageSpacesService);

  space: StorageSpaceDetail | null = null;
  loading = false;
  loadError = '';
  error403 = false;
  error404 = false;

  renameValue = '';
  renaming = false;
  renameError = '';

  addMemberUserId = '';
  addMemberRole: 'editor' | 'viewer' = 'editor';
  addingMember = false;
  addMemberError = '';

  removingMember = '';
  memberActionError = '';

  mediaIdsInput = '';
  assigning = false;
  assignError = '';
  assignSuccess = '';

  private spaceId = '';

  ngOnInit(): void {
    this.spaceId = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.error403 = false;
    this.error404 = false;
    this.spacesService.getSpace(this.spaceId).subscribe({
      next: (space) => {
        this.space = space;
        this.renameValue = space.name;
        this.loading = false;
      },
      error: (err: { status?: number }) => {
        this.loading = false;
        if (err?.status === 403) this.error403 = true;
        else if (err?.status === 404) this.error404 = true;
        else this.loadError = 'Failed to load space details.';
      },
    });
  }

  renameSpace(): void {
    const name = this.renameValue.trim();
    if (!name || !this.space) return;
    this.renaming = true;
    this.renameError = '';
    this.spacesService.renameSpace(this.spaceId, name).subscribe({
      next: (updated) => {
        if (this.space) this.space.name = updated.name;
        this.renaming = false;
      },
      error: () => {
        this.renameError = 'Failed to rename space.';
        this.renaming = false;
      },
    });
  }

  addMember(): void {
    const userId = this.addMemberUserId.trim();
    if (!userId || !this.space) return;
    this.addingMember = true;
    this.addMemberError = '';
    this.spacesService.addMember(this.spaceId, userId, this.addMemberRole).subscribe({
      next: (member) => {
        if (this.space) this.space.members = [...this.space.members, member];
        this.addMemberUserId = '';
        this.addingMember = false;
      },
      error: (err: { status?: number }) => {
        this.addMemberError =
          err?.status === 409 ? 'User is already a member.' : 'Failed to add member.';
        this.addingMember = false;
      },
    });
  }

  changeMemberRole(member: StorageSpaceMember, role: 'editor' | 'viewer'): void {
    this.memberActionError = '';
    this.spacesService.updateMemberRole(this.spaceId, member.userId, role).subscribe({
      next: (updated) => {
        if (!this.space) return;
        const idx = this.space.members.findIndex((m) => m.userId === member.userId);
        if (idx !== -1) this.space.members[idx] = updated;
      },
      error: () => {
        this.memberActionError = 'Failed to update role.';
      },
    });
  }

  removeMember(member: StorageSpaceMember): void {
    if (!this.space) return;
    this.removingMember = member.userId;
    this.memberActionError = '';
    this.spacesService.removeMember(this.spaceId, member.userId).subscribe({
      next: () => {
        if (this.space)
          this.space.members = this.space.members.filter((m) => m.userId !== member.userId);
        this.removingMember = '';
      },
      error: () => {
        this.memberActionError = 'Failed to remove member.';
        this.removingMember = '';
      },
    });
  }

  assignMedia(): void {
    const raw = this.mediaIdsInput.trim();
    if (!raw) return;
    const mediaIds = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    this.assigning = true;
    this.assignError = '';
    this.assignSuccess = '';
    this.spacesService.assignMedia(this.spaceId, mediaIds).subscribe({
      next: (result) => {
        this.assignSuccess = `${result.updated} item${result.updated !== 1 ? 's' : ''} assigned.`;
        this.mediaIdsInput = '';
        this.assigning = false;
        if (this.space) this.space.mediaCount += result.updated;
      },
      error: () => {
        this.assignError = 'Failed to assign media.';
        this.assigning = false;
      },
    });
  }
}
