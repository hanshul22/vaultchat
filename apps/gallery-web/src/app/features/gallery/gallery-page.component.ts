import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  computed,
  ViewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';

import { MediaService } from '../../core/services/media.service';
import { VideoPlaybackService } from '../../core/services/video-playback.service';
import { MediaItem, mediaFamily } from '../../core/models/media-item.model';
import { PaginationMeta } from '../../core/models/paginated-media-response.model';

/** View-model enriched with the derived thumbnail URL. */
interface MediaCard extends MediaItem {
  thumbnailUrl: string;
}

type LoadState = 'loading' | 'loaded' | 'error';

/** Per-item delete outcome tracked during a bulk delete run. */
interface DeleteFailure {
  id: string;
  mimeType: string;
}

/**
 * /gallery — real API-backed media grid with bulk select and bulk delete.
 *
 * Fetches page 1 of the authenticated user's media on init, renders a
 * responsive thumbnail grid, and supports:
 *  - Selection mode toggled via a toolbar button or keyboard (Enter/Space)
 *  - Individual card selection via checkbox or keyboard
 *  - Bulk delete with a confirmation dialog before any destructive action
 *  - Sequential delete execution reusing the existing DELETE /media/:id endpoint
 *  - Per-item failure reporting without silently swallowing errors
 */
@Component({
  selector: 'app-gallery-page',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gallery-page.component.html',
  styleUrl: './gallery-page.component.scss',
})
export class GalleryPageComponent implements OnInit, OnDestroy {
  @ViewChild('videoEl') private videoElRef?: ElementRef<HTMLVideoElement>;

  private readonly mediaService = inject(MediaService);
  private readonly playback = inject(VideoPlaybackService);

  readonly loadState = signal<LoadState>('loading');
  readonly items = signal<MediaCard[]>([]);
  readonly meta = signal<PaginationMeta | null>(null);

  readonly activeVideo = signal<MediaCard | null>(null);
  readonly playbackError = signal(false);

  readonly selectionMode = signal(false);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly allSelected = computed(
    () => this.items().length > 0 && this.selectedIds().size === this.items().length,
  );

  readonly showConfirmDialog = signal(false);
  readonly deletingIds = signal<Set<string>>(new Set());
  readonly isDeleting = signal(false);
  readonly deleteFailures = signal<DeleteFailure[]>([]);

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.playback.detach();
  }

  load(): void {
    this.loadState.set('loading');
    this.exitSelectionMode();

    this.mediaService.getMedia({ page: 1 }).subscribe({
      next: (response) => {
        this.items.set(response.data as MediaCard[]);
        this.meta.set(response.meta);
        this.loadState.set('loaded');
      },
      error: () => {
        this.loadState.set('error');
      },
    });
  }

  enterSelectionMode(): void {
    this.selectionMode.set(true);
    this.selectedIds.set(new Set());
    this.deleteFailures.set([]);
  }

  exitSelectionMode(): void {
    this.selectionMode.set(false);
    this.selectedIds.set(new Set());
    this.showConfirmDialog.set(false);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  isDeletingItem(id: string): boolean {
    return this.deletingIds().has(id);
  }

  toggleItem(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedIds.set(next);
  }

  toggleSelectAll(): void {
    if (this.allSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(this.items().map((i) => i.id)));
    }
  }

  onCardClick(item: MediaCard): void {
    if (this.selectionMode()) {
      this.toggleItem(item.id);
      return;
    }
    if (this.family(item) === 'video') {
      this.openPlayer(item);
    }
  }

  requestBulkDelete(): void {
    if (this.selectedCount() === 0 || this.isDeleting()) return;
    this.showConfirmDialog.set(true);
  }

  cancelBulkDelete(): void {
    this.showConfirmDialog.set(false);
  }

  confirmBulkDelete(): void {
    this.showConfirmDialog.set(false);
    this.isDeleting.set(true);
    this.deleteFailures.set([]);

    const ids = Array.from(this.selectedIds());
    this.runSequentialDeletes(ids, 0, []);
  }

  private runSequentialDeletes(ids: string[], index: number, failures: DeleteFailure[]): void {
    if (index >= ids.length) {
      this.isDeleting.set(false);
      this.deletingIds.set(new Set());

      if (failures.length > 0) {
        this.deleteFailures.set(failures);
      }

      const failedIds = new Set(failures.map((f) => f.id));
      this.items.update((current) =>
        current.filter((item) => failedIds.has(item.id) || !ids.includes(item.id)),
      );

      const deletedCount = ids.length - failures.length;
      this.meta.update((m) => (m ? { ...m, total: Math.max(0, m.total - deletedCount) } : m));

      if (failures.length === 0) {
        this.exitSelectionMode();
      } else {
        this.selectedIds.set(new Set(failures.map((f) => f.id)));
      }
      return;
    }

    const id = ids[index];

    this.deletingIds.update((s) => new Set([...s, id]));

    this.mediaService.deleteMedia(id).subscribe({
      next: () => {
        this.deletingIds.update((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        this.runSequentialDeletes(ids, index + 1, failures);
      },
      error: () => {
        this.deletingIds.update((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        const failedItem = this.items().find((i) => i.id === id);
        const newFailures = [...failures, { id, mimeType: failedItem?.mimeType ?? 'unknown' }];
        this.runSequentialDeletes(ids, index + 1, newFailures);
      },
    });
  }

  dismissFailures(): void {
    this.deleteFailures.set([]);
  }

  openPlayer(item: MediaCard): void {
    this.playback.detach();
    this.activeVideo.set(item);
    this.playbackError.set(false);

    setTimeout(() => {
      const videoEl = this.videoElRef?.nativeElement;
      if (!videoEl) return;

      this.playback.attach(videoEl, item.url, item.mimeType).catch(() => {
        this.playbackError.set(true);
      });
    }, 0);
  }

  closePlayer(): void {
    this.playback.detach();
    this.activeVideo.set(null);
    this.playbackError.set(false);
  }

  family(item: MediaItem): 'image' | 'video' | 'other' {
    return mediaFamily(item.mimeType);
  }

  hasMorePages(): boolean {
    const m = this.meta();
    return m !== null && m.totalPages > 1;
  }

  activeVideoDuration(): string | null {
    return this.activeVideo()?.durationSeconds ?? null;
  }

  videoAriaLabel(item: MediaItem): string | null {
    return this.family(item) === 'video' ? `Play ${item.mimeType}` : null;
  }

  formatDuration(seconds: string | null): string {
    if (!seconds) return '0:00';
    const total = Math.floor(parseFloat(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
