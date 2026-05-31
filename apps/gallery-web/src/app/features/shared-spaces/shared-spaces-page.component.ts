import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { StorageSpacesService } from '../../core/services/storage-spaces.service';
import { StorageSpace } from '../../core/models/storage-space.model';

@Component({
  selector: 'app-shared-spaces-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page">
      <h1 class="page-title">Shared Spaces</h1>

      <section class="create-section" aria-label="Create a new shared space">
        <form (ngSubmit)="createSpace()" class="create-form">
          <input
            type="text"
            [(ngModel)]="newSpaceName"
            name="newSpaceName"
            placeholder="New space name"
            class="input"
            aria-label="New space name"
            required
          />
          <button
            type="submit"
            class="btn btn-primary"
            [disabled]="!newSpaceName.trim() || creating"
          >
            {{ creating ? 'Creating…' : 'Create Space' }}
          </button>
        </form>
        @if (createError) {
          <p class="error" role="alert">{{ createError }}</p>
        }
      </section>

      <section aria-label="Your shared spaces">
        @if (loading) {
          <p class="status">Loading…</p>
        }
        @if (loadError) {
          <p class="error" role="alert">{{ loadError }}</p>
        }
        @if (!loading && !loadError && spaces.length === 0) {
          <p class="empty">No shared spaces yet. Create one above to get started.</p>
        }
        @if (spaces.length > 0) {
          <ul class="space-list" role="list">
            @for (space of spaces; track space.id) {
              <li class="space-card">
                <div class="space-info">
                  <span class="space-name">{{ space.name }}</span>
                  <span class="role-badge role-{{ space.myRole }}">{{ space.myRole }}</span>
                </div>
                <div class="space-meta">
                  <span
                    >{{ space.memberCount }} member{{ space.memberCount !== 1 ? 's' : '' }}</span
                  >
                  <span>{{ space.mediaCount }} media</span>
                </div>
                <a [routerLink]="['/shared-spaces', space.id]" class="btn btn-secondary">Open</a>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
  styles: [
    `
      .page {
        max-width: 720px;
      }
      .page-title {
        margin-bottom: 1.5rem;
        font-size: 1.5rem;
      }
      .create-section {
        margin-bottom: 2rem;
      }
      .create-form {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        flex-wrap: wrap;
      }
      .input {
        padding: 0.5rem 0.75rem;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 0.95rem;
        min-width: 220px;
      }
      .btn {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
        text-decoration: none;
        display: inline-block;
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
      .btn-secondary {
        background: #e5e7eb;
        color: #111;
      }
      .btn-secondary:hover {
        background: #d1d5db;
      }
      .space-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .space-card {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        background: #fff;
        flex-wrap: wrap;
      }
      .space-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
      }
      .space-name {
        font-weight: 600;
      }
      .space-meta {
        display: flex;
        gap: 1rem;
        color: #6b7280;
        font-size: 0.875rem;
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
      .status,
      .empty {
        color: #6b7280;
      }
      .error {
        color: #dc2626;
      }
    `,
  ],
})
export class SharedSpacesPageComponent implements OnInit {
  private readonly spacesService = inject(StorageSpacesService);

  spaces: StorageSpace[] = [];
  loading = false;
  loadError = '';
  newSpaceName = '';
  creating = false;
  createError = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.spacesService.listSpaces().subscribe({
      next: (spaces) => {
        this.spaces = spaces;
        this.loading = false;
      },
      error: () => {
        this.loadError = 'Failed to load shared spaces.';
        this.loading = false;
      },
    });
  }

  createSpace(): void {
    const name = this.newSpaceName.trim();
    if (!name) return;
    this.creating = true;
    this.createError = '';
    this.spacesService.createSpace(name).subscribe({
      next: (space) => {
        this.spaces = [space, ...this.spaces];
        this.newSpaceName = '';
        this.creating = false;
      },
      error: () => {
        this.createError = 'Failed to create space.';
        this.creating = false;
      },
    });
  }
}
