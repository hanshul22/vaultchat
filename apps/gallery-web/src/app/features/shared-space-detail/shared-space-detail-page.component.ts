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
  template: `
    <div class="page">
      @if (loading) {
        <p class="status">Loading…</p>
      }
      @if (error403) {
        <div class="error-block" role="alert">
          <strong>Access denied.</strong> You don't have permission to view this space.
        </div>
      }
      @if (error404) {
        <div class="error-block" role="alert">
          <strong>Not found.</strong> This shared space doesn't exist.
        </div>
      }
      @if (loadError && !error403 && !error404) {
        <div class="error-block" role="alert">{{ loadError }}</div>
      }

      @if (space) {
        <div class="page-header">
          <h1 class="page-title">{{ space.name }}</h1>
          <span class="role-badge role-{{ space.myRole }}">{{ space.myRole }}</span>
        </div>

        <div class="meta-row">
          <span
            >Owner: <strong>{{ space.owner.fullName }}</strong> ({{ space.owner.email }})</span
          >
          <span>{{ space.mediaCount }} media item{{ space.mediaCount !== 1 ? 's' : '' }}</span>
        </div>

        @if (space.myRole === 'owner') {
          <section class="section" aria-label="Rename space">
            <h2 class="section-title">Rename Space</h2>
            <form (ngSubmit)="renameSpace()" class="inline-form">
              <input
                type="text"
                [(ngModel)]="renameValue"
                name="renameValue"
                class="input"
                aria-label="New space name"
                required
              />
              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="!renameValue.trim() || renaming"
              >
                {{ renaming ? 'Saving…' : 'Rename' }}
              </button>
            </form>
            @if (renameError) {
              <p class="error" role="alert">{{ renameError }}</p>
            }
          </section>
        }

        <section class="section" aria-label="Members">
          <h2 class="section-title">Members</h2>

          @if (space.members.length > 0) {
            <ul class="member-list" role="list">
              @for (member of space.members; track member.userId) {
                <li class="member-row">
                  <span class="member-name">{{ member.user?.fullName ?? member.userId }}</span>
                  <span class="member-email">{{ member.user?.email ?? '' }}</span>
                  <span class="role-badge role-{{ member.role }}">{{ member.role }}</span>
                  @if (space.myRole === 'owner') {
                    <select
                      [ngModel]="member.role"
                      (ngModelChange)="changeMemberRole(member, $event)"
                      name="role-{{ member.userId }}"
                      class="select"
                      [attr.aria-label]="
                        'Change role for ' + (member.user?.fullName ?? member.userId)
                      "
                    >
                      <option value="editor">editor</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <button
                      class="btn btn-danger"
                      (click)="removeMember(member)"
                      [disabled]="removingMember === member.userId"
                      [attr.aria-label]="'Remove ' + (member.user?.fullName ?? member.userId)"
                    >
                      {{ removingMember === member.userId ? 'Removing…' : 'Remove' }}
                    </button>
                  }
                </li>
              }
            </ul>
          } @else {
            <p class="empty">No members yet.</p>
          }

          @if (memberActionError) {
            <p class="error" role="alert">{{ memberActionError }}</p>
          }

          @if (space.myRole === 'owner') {
            <form (ngSubmit)="addMember()" class="inline-form add-member-form">
              <input
                type="text"
                [(ngModel)]="addMemberUserId"
                name="addMemberUserId"
                placeholder="User ID"
                class="input"
                aria-label="User ID to add"
                required
              />
              <select
                [(ngModel)]="addMemberRole"
                name="addMemberRole"
                class="select"
                aria-label="Role"
              >
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="!addMemberUserId.trim() || addingMember"
              >
                {{ addingMember ? 'Adding…' : 'Add Member' }}
              </button>
            </form>
            @if (addMemberError) {
              <p class="error" role="alert">{{ addMemberError }}</p>
            }
          }
        </section>

        @if (space.myRole === 'owner' || space.myRole === 'editor') {
          <section class="section" aria-label="Assign media">
            <h2 class="section-title">Assign Media</h2>
            <p class="hint">Enter comma-separated media IDs to assign them to this space.</p>
            <form (ngSubmit)="assignMedia()" class="inline-form">
              <textarea
                [(ngModel)]="mediaIdsInput"
                name="mediaIdsInput"
                class="textarea"
                rows="3"
                placeholder="id1, id2, id3"
                aria-label="Media IDs to assign"
              ></textarea>
              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="!mediaIdsInput.trim() || assigning"
              >
                {{ assigning ? 'Assigning…' : 'Assign' }}
              </button>
            </form>
            @if (assignSuccess) {
              <p class="success" role="status">{{ assignSuccess }}</p>
            }
            @if (assignError) {
              <p class="error" role="alert">{{ assignError }}</p>
            }
          </section>
        }
      }
    </div>
  `,
  styles: [
    `
      .page {
        max-width: 760px;
      }
      .page-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
      }
      .page-title {
        font-size: 1.5rem;
        margin: 0;
      }
      .meta-row {
        display: flex;
        gap: 2rem;
        color: #6b7280;
        font-size: 0.9rem;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
      }
      .section {
        margin-bottom: 2rem;
      }
      .section-title {
        font-size: 1.1rem;
        margin-bottom: 0.75rem;
      }
      .inline-form {
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
        flex-wrap: wrap;
      }
      .add-member-form {
        margin-top: 1rem;
      }
      .input {
        padding: 0.5rem 0.75rem;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 0.9rem;
        min-width: 200px;
      }
      .select {
        padding: 0.5rem 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 0.9rem;
      }
      .textarea {
        padding: 0.5rem 0.75rem;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 0.9rem;
        width: 100%;
        max-width: 400px;
        resize: vertical;
      }
      .btn {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
      }
      .btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .btn-primary {
        background: #4f46e5;
        color: #fff;
      }
      .btn-primary:hover:not(:disabled) {
        background: #4338ca;
      }
      .btn-danger {
        background: #fee2e2;
        color: #991b1b;
      }
      .btn-danger:hover:not(:disabled) {
        background: #fecaca;
      }
      .member-list {
        list-style: none;
        padding: 0;
        margin: 0 0 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .member-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.6rem 0.75rem;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        flex-wrap: wrap;
      }
      .member-name {
        font-weight: 600;
      }
      .member-email {
        color: #6b7280;
        font-size: 0.875rem;
        flex: 1;
      }
      .role-badge {
        font-size: 0.75rem;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        font-weight: 600;
        text-transform: uppercase;
      }
      .role-owner {
        background: #fef3c7;
        color: #92400e;
      }
      .role-editor {
        background: #dbeafe;
        color: #1e40af;
      }
      .role-viewer {
        background: #f3f4f6;
        color: #374151;
      }
      .hint {
        color: #6b7280;
        font-size: 0.875rem;
        margin-bottom: 0.5rem;
      }
      .status,
      .empty {
        color: #6b7280;
      }
      .error {
        color: #dc2626;
        margin-top: 0.5rem;
      }
      .success {
        color: #16a34a;
        margin-top: 0.5rem;
      }
      .error-block {
        padding: 1rem;
        background: #fee2e2;
        border: 1px solid #fca5a5;
        border-radius: 6px;
        color: #991b1b;
        margin-bottom: 1rem;
      }
    `,
  ],
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
