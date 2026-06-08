import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { UploadService } from '../../core/services/upload.service';
import { VideoProcessingService } from '../../core/services/video-processing.service';
import { UploadQueueItem, UploadQueueStatus } from '../../core/models/upload-queue-item.model';
import { PreflightRejectReason } from '../../core/models/media-upload-preflight.model';
import {
  VideoProbeResult,
  MAX_VIDEO_HEIGHT_PX,
  VIDEO_CRF,
} from '../../core/models/video-processing.model';
import {
  UploadQueueService,
  DIRECT_UPLOAD_MAX_CHUNK_SIZE_BYTES,
} from '../../uploads/data/upload-queue.service';
import { UploadTaskPartInput } from '../../uploads/data/upload-task.model';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
] as const;

const FILE_INPUT_ACCEPT = ALLOWED_MIME_TYPES.join(',');
const MAX_FILE_BYTES = 100 * 1024 * 1024;

function isAllowedMime(mime: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function preflightReasonMessage(reason: PreflightRejectReason | undefined): string {
  if (reason === 'VAULT_FULL') {
    return 'Your Vault is full. Delete some files or add another Cloudinary account.';
  }
  if (reason === 'FILE_TOO_LARGE_FOR_ANY_ACCOUNT') {
    return 'This file is larger than the free space on any single Cloudinary account in your Vault.';
  }
  return 'The server rejected this file. Check your Vault capacity.';
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * /uploads — upload queue with preflight validation and direct Cloudinary upload execution.
 *
 * State machine per file:
 *   video:  selected → probing → probed → processing → processed → checking → ready
 *              → splitting? → uploading → uploaded
 *   image:  selected → checking → ready → uploading → uploaded
 *   either: any → uploadError (retryable)
 *
 * After preflight passes, video files are compressed with ffmpeg.wasm (H.264 CRF 18,
 * 1080p max, browser-side only). The processed output — or original file for images —
 * is then passed to UploadQueueService.executeDirectUpload(), which handles:
 *   preflight → direct-upload-init → per-part Cloudinary uploads → direct-upload-complete
 *
 * Files larger than 95 MB after processing are split into sequential ≤95 MB parts
 * before being handed to the queue service. All parts of one media item share a
 * single upload session.
 *
 * Upload progress stages shown in the UI:
 *   checking   → Checking vault…
 *   processing → Transcoding… (ratio%)
 *   splitting  → Splitting into N parts…
 *   uploading  → Uploading to your Vault…  /  Uploading part N of M…
 *   finalizing → Finalizing…
 *   uploaded   → ✓ Uploaded successfully
 */
@Component({
  selector: 'app-uploads-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './uploads-page.component.html',
  styleUrl: './uploads-page.component.scss',
})
export class UploadsPageComponent {
  @ViewChild('fileInput') private fileInputRef!: ElementRef<HTMLInputElement>;

  private readonly uploadService = inject(UploadService);
  private readonly videoProcessing = inject(VideoProcessingService);
  private readonly uploadQueue = inject(UploadQueueService);

  /**
   * Maps clientId from the local UploadQueueItem to the clientId of the
   * corresponding UploadTask in UploadQueueService so we can call
   * executeDirectUpload after processing.
   */
  private readonly taskClientIdMap = new Map<string, string>();

  readonly fileInputAccept = FILE_INPUT_ACCEPT;
  readonly queue = signal<UploadQueueItem[]>([]);
  readonly isDragging = signal(false);

  readonly ffmpegState = toSignal(this.videoProcessing.loadState$, {
    initialValue: this.videoProcessing.loadState,
  });

  isCheckingAny(): boolean {
    return this.queue().some((i) => i.status === 'checking');
  }

  isUploadingAny(): boolean {
    return this.queue().some((i) => i.status === 'uploading');
  }

  isProbingAny(): boolean {
    return this.queue().some((i) => i.status === 'probing');
  }

  isProcessingAny(): boolean {
    return this.queue().some((i) => i.status === 'processing' || i.status === 'splitting');
  }

  isBusy(): boolean {
    return (
      this.isCheckingAny() || this.isUploadingAny() || this.isProbingAny() || this.isProcessingAny()
    );
  }

  hasPendingItems(): boolean {
    return this.queue().some(
      (i) =>
        i.status === 'selected' ||
        i.status === 'probed' ||
        i.status === 'processed' ||
        i.status === 'probeError' ||
        i.status === 'processError' ||
        i.status === 'uploadError',
    );
  }

  hasReadyItems(): boolean {
    return this.queue().some((i) => i.status === 'ready');
  }

  readyCount(): number {
    return this.queue().filter((i) => i.status === 'ready').length;
  }

  uploadedCount(): number {
    return this.queue().filter((i) => i.status === 'uploaded').length;
  }

  hasVideoItems(): boolean {
    return this.queue().some((i) => i.mimeType.startsWith('video/'));
  }

  openFilePicker(): void {
    this.fileInputRef.nativeElement.click();
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(Array.from(input.files));
      input.value = '';
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(): void {
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    const files = event.dataTransfer?.files;
    if (files) this.addFiles(Array.from(files));
  }

  private addFiles(files: File[]): void {
    const newItems: UploadQueueItem[] = files.map((file) => {
      if (!isAllowedMime(file.type)) {
        return this.makeItem(
          file,
          'uploadError',
          `Unsupported type "${file.type}". Allowed: JPEG, PNG, WebP, GIF, MP4, QuickTime.`,
        );
      }
      if (file.size > MAX_FILE_BYTES) {
        return this.makeItem(
          file,
          'uploadError',
          `File exceeds the 100 MB limit (${formatBytes(file.size)}).`,
        );
      }
      return this.makeItem(file, 'selected');
    });

    this.queue.update((q) => [...q, ...newItems]);

    for (const item of newItems) {
      if (item.status !== 'selected') continue;
      if (item.mimeType.startsWith('video/')) {
        void this.probeOne(item.clientId);
      } else {
        this.runPreflightOne(item.clientId);
      }
    }
  }

  removeItem(clientId: string): void {
    const taskClientId = this.taskClientIdMap.get(clientId);
    if (taskClientId) {
      this.uploadQueue.removeTask(taskClientId);
      this.taskClientIdMap.delete(clientId);
    }
    this.queue.update((q) => q.filter((i) => i.clientId !== clientId));
  }

  clearQueue(): void {
    this.uploadQueue.clear();
    this.taskClientIdMap.clear();
    this.queue.set([]);
  }

async probeOne(clientId: string): Promise<void> {
  const item = this.queue().find((i) => i.clientId === clientId);
  if (!item || !item.mimeType.startsWith('video/')) return;
  if (item.status === 'probing' || item.status === 'uploading') return;

  this.patchItem(clientId, {
    status: 'probing',
    probeResult: null,
    probeErrorMessage: undefined,
  });

  void this.videoProcessing.load().catch(() => undefined);

  try {
    const result = await this.videoProcessing.probeVideo(item.file);
    this.patchItem(clientId, { status: 'probed', probeResult: result });
    this.runPreflightOne(clientId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not read video metadata.';
    this.patchItem(clientId, {
      status: 'probeError',
      probeErrorMessage: message,
    });
    this.runPreflightOne(clientId);
  }
}

  async processOne(clientId: string): Promise<void> {
    const item = this.queue().find((i) => i.clientId === clientId);
    if (!item || !item.mimeType.startsWith('video/')) return;
    if (item.status === 'processing' || item.status === 'uploading') return;

    this.patchItem(clientId, {
      status: 'processing',
      processingProgress: null,
      processErrorMessage: undefined,
      processedFile: null,
    });

    const progressSub = this.videoProcessing.progress$.subscribe((p) => {
      this.patchItem(clientId, {
        processingProgress: { ratio: p.ratio, time: p.time, stage: 'transcoding' },
      });
    });

    try {
      await this.videoProcessing.load();

      const result = await this.videoProcessing.processVideo({
        file: item.file,
        maxHeightPx: MAX_VIDEO_HEIGHT_PX,
        crf: VIDEO_CRF,
        // Pass the probe result we already have so processVideo never
        // re-runs a potentially slow/hanging internal ffprobe call.
        probe: item.probeResult ?? null,
      });

      // Ensure the item hasn't been removed while we were processing.
      const current = this.queue().find((i) => i.clientId === clientId);
      if (!current) return;

      this.patchItem(clientId, {
        status: 'processed',
        processedFile: result.outputFile,
        processingProgress: null,
      });

      if (current.preflightResult) {
        this.patchItem(clientId, { status: 'ready' });
        void this.uploadOne(clientId);
      }
    } catch (err) {
      // Surface any error — including timeouts — as a visible processError so
      // the queue never stays stuck in "Compressing…".
      const raw = err instanceof Error ? err.message : 'Video processing failed.';
      // Distinguish timeout messages for a friendlier UI label.
      const message = raw.includes('timed out')
        ? `Processing timed out: ${raw}`
        : raw;
      this.patchItem(clientId, {
        status: 'processError',
        processErrorMessage: message,
        processingProgress: null,
      });
    } finally {
      progressSub.unsubscribe();
    }
  }

  runPreflightAll(): void {
    const pending = this.queue().filter(
      (i) =>
        i.status === 'selected' ||
        i.status === 'probed' ||
        i.status === 'probeError' ||
        i.status === 'processed' ||
        i.status === 'processError' ||
        i.status === 'uploadError',
    );
    for (const item of pending) {
      this.runPreflightOne(item.clientId);
    }
  }

  runPreflightOne(clientId: string): void {
    const item = this.queue().find((i) => i.clientId === clientId);
    if (
      !item ||
      item.status === 'checking' ||
      item.status === 'uploading' ||
      item.status === 'probing' ||
      item.status === 'processing'
    )
      return;

    const sizeForPreflight = item.processedFile?.size ?? item.sizeBytes;

    this.patchItem(clientId, {
      status: 'checking',
      errorMessage: undefined,
      preflightResult: undefined,
      uploadedMedia: undefined,
    });

    this.uploadService.checkPreflight(sizeForPreflight, item.mimeType).subscribe({
      next: (result) => {
        if (result.canUpload) {
          this.patchItem(clientId, { status: 'ready', preflightResult: result });

          const current = this.queue().find((i) => i.clientId === clientId);
          if (current && current.mimeType.startsWith('video/') && !current.processedFile) {
            void this.processOne(clientId);
          }
        } else {
          this.patchItem(clientId, {
            status: 'uploadError',
            errorMessage: preflightReasonMessage(result.reason),
          });
        }
      },
      error: (err: HttpErrorResponse) => {
        const body = err.error as { reason?: string; message?: string } | null;
        let message: string;
        if (err.status === 415) {
          message = `Unsupported media type. The server rejected "${item.mimeType}".`;
        } else if (err.status === 507) {
          message = preflightReasonMessage(body?.reason as PreflightRejectReason | undefined);
        } else if (err.status === 400) {
          message = body?.message ?? 'Invalid request. Check the file size and type.';
        } else if (err.status === 401) {
          message = 'Session expired. Please refresh the page and sign in again.';
        } else {
          message = 'Could not reach the server. Please try again.';
        }
        this.patchItem(clientId, { status: 'uploadError', errorMessage: message });
      },
    });
  }

  uploadAll(): void {
    const ready = this.queue().filter((i) => i.status === 'ready');
    for (const item of ready) {
      void this.uploadOne(item.clientId);
    }
  }

  async uploadOne(clientId: string): Promise<void> {
    const item = this.queue().find((i) => i.clientId === clientId);
    if (!item || item.status !== 'ready') return;

    const taskClientId = this.taskClientIdMap.get(clientId);
    if (!taskClientId) {
      this.patchItem(clientId, {
        status: 'uploadError',
        errorMessage: 'Upload task reference lost. Please remove and re-add the file.',
      });
      return;
    }

    const fileToUpload = item.processedFile ?? item.file;

    if (fileToUpload.size > DIRECT_UPLOAD_MAX_CHUNK_SIZE_BYTES) {
      await this.uploadChunked(clientId, taskClientId, fileToUpload);
    } else {
      await this.uploadSinglePart(clientId, taskClientId, fileToUpload);
    }
  }

  /**
   * Executes a direct upload for a file that fits in a single Cloudinary part.
   * Passes the processed file (or original) as `processedFile` so the queue
   * service uses the correct size for the preflight and init calls.
   */
  private async uploadSinglePart(
    clientId: string,
    taskClientId: string,
    fileToUpload: File,
  ): Promise<void> {
    this.patchItem(clientId, {
      status: 'uploading',
      errorMessage: undefined,
      totalChunks: 1,
      currentChunkIndex: 0,
    });

    try {
      const completedTask = await this.uploadQueue.executeDirectUpload(taskClientId, {
        processedFile: fileToUpload,
      });

      this.patchItem(clientId, {
        status: 'uploaded',
        uploadedMedia: completedTask.completedMedia ?? undefined,
        currentChunkIndex: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      this.patchItem(clientId, {
        status: 'uploadError',
        errorMessage: message,
        currentChunkIndex: null,
      });
    }
  }

  /**
   * Splits the file into ≤95 MB chunks, then passes them as ordered
   * UploadTaskPartInput[] to executeDirectUpload for sequential upload.
   */
  private async uploadChunked(
    clientId: string,
    taskClientId: string,
    fileToUpload: File,
  ): Promise<void> {
    this.patchItem(clientId, {
      status: 'splitting',
      errorMessage: undefined,
      currentChunkIndex: null,
    });

    let splitResult;
    try {
      splitResult = this.videoProcessing.splitFile(fileToUpload, DIRECT_UPLOAD_MAX_CHUNK_SIZE_BYTES);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to split file.';
      this.patchItem(clientId, { status: 'uploadError', errorMessage: message });
      return;
    }

    const parts: UploadTaskPartInput[] = splitResult.chunks.map((chunk) => ({
      file: chunk.file,
      partIndex: chunk.partIndex,
      totalParts: chunk.totalParts,
      sizeBytes: chunk.sizeBytes,
    }));

    this.patchItem(clientId, {
      status: 'uploading',
      totalChunks: parts.length,
      currentChunkIndex: 0,
      chunkMediaId: splitResult.mediaId,
    });

    try {
      const completedTask = await this.uploadQueue.executeDirectUpload(taskClientId, {
        processedFile: fileToUpload,
        parts,
      });

      this.patchItem(clientId, {
        status: 'uploaded',
        uploadedMedia: completedTask.completedMedia ?? undefined,
        currentChunkIndex: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chunked upload failed.';
      this.patchItem(clientId, {
        status: 'uploadError',
        errorMessage: message,
        currentChunkIndex: null,
      });
    }
  }

  private makeItem(file: File, status: UploadQueueStatus, errorMessage?: string): UploadQueueItem {
    const clientId = crypto.randomUUID();

    const task = this.uploadQueue.addFile(file);
    this.taskClientIdMap.set(clientId, task.clientId);

    return {
      clientId,
      filename: file.name,
      sizeBytes: file.size,
      mimeType: file.type,
      status,
      errorMessage,
      file,
    };
  }

  private patchItem(
    clientId: string,
    patch: Partial<
      Omit<UploadQueueItem, 'clientId' | 'file' | 'filename' | 'sizeBytes' | 'mimeType'>
    >,
  ): void {
    this.queue.update((q) => q.map((i) => (i.clientId === clientId ? { ...i, ...patch } : i)));
  }

  mimeIcon(mimeType: string): string {
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('image/')) return '🖼';
    return '📄';
  }

  readonly formatBytes = formatBytes;
  readonly formatDuration = formatDuration;

  /** Exposes VideoProbeResult type for template type-checking. */
  asProbeResult(v: unknown): VideoProbeResult | null {
    return v as VideoProbeResult | null;
  }
}
