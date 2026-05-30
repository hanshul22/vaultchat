import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import {
  FfmpegLoadState,
  FfmpegProgress,
  VideoProbeResult,
  VideoProcessingRequest,
  VideoProcessingResult,
} from '../models/video-processing.model';

/**
 * CDN base URL for @ffmpeg/core-mt WASM assets.
 * Using the ESM variant which is required for the multi-threaded worker.
 */
const CORE_MT_BASE = 'https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/esm';

/**
 * Manages the ffmpeg.wasm engine lifecycle and exposes the video-processing
 * contract for the upload pipeline.
 *
 * ── Architecture ──────────────────────────────────────────────────────────
 * • ffmpeg.wasm is lazy-loaded on first demand to avoid blocking the initial
 *   page load with the ~30 MB WASM binary.
 * • The multi-threaded core (@ffmpeg/core-mt) is loaded from the unpkg CDN.
 *   SharedArrayBuffer must be available (requires COOP/COEP headers in
 *   production). If the load fails for any reason, the service transitions
 *   to 'failed' and the UI falls back to direct upload without compression.
 * • probeVideo() and processVideo() remain stubs in this step. They throw a
 *   clearly labelled "not implemented yet" error so the next step can fill
 *   in the real logic without changing the service interface.
 *
 * ── PRD pipeline (next step) ──────────────────────────────────────────────
 *   1. Probe: read resolution, codec, duration, bitrate via ffprobe.
 *   2. Decide: skip transcoding if already H.264 ≤ 1080p and ≤ 100 MB.
 *   3. Transcode: H.264 CRF 18, downscale to 1080p if needed.
 *   4. (Later) Split: if output > 100 MB, chunk for multipart upload.
 */
@Injectable({ providedIn: 'root' })
export class VideoProcessingService implements OnDestroy {
  // ── Public state streams ─────────────────────────────────────────────────

  private readonly _loadState = new BehaviorSubject<FfmpegLoadState>('idle');
  private readonly _progress = new Subject<FfmpegProgress>();
  private readonly _loadError = new BehaviorSubject<string | null>(null);

  /** Emits the current engine lifecycle state. */
  readonly loadState$: Observable<FfmpegLoadState> = this._loadState.asObservable();

  /** Emits progress events during an active processing operation. */
  readonly progress$: Observable<FfmpegProgress> = this._progress.asObservable();

  /** Emits the last load error message, or null when healthy. */
  readonly loadError$: Observable<string | null> = this._loadError.asObservable();

  // ── Internal state ───────────────────────────────────────────────────────

  /**
   * The lazily-created FFmpeg instance.
   * Typed as `unknown` so the service compiles in Node/Jest environments
   * where @ffmpeg/ffmpeg resolves to an empty module.
   */
  private ffmpegInstance: unknown = null;

  /** Prevents concurrent load() calls from racing. */
  private loadPromise: Promise<void> | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.teardown();
    this._loadState.complete();
    this._progress.complete();
    this._loadError.complete();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** Returns a snapshot of the current load state without subscribing. */
  get loadState(): FfmpegLoadState {
    return this._loadState.getValue();
  }

  /** Returns true when the engine is loaded and ready to process files. */
  get isReady(): boolean {
    return this._loadState.getValue() === 'ready';
  }

  /**
   * Lazy-loads the ffmpeg.wasm engine.
   *
   * Safe to call multiple times — concurrent calls share the same promise
   * and resolve immediately when the engine is already loaded.
   *
   * Load errors are captured and surfaced via `loadState$` / `loadError$`
   * rather than thrown, so callers never need to catch.
   */
  async load(): Promise<void> {
    const current = this._loadState.getValue();

    if (current === 'ready') return;
    if (current === 'loading' && this.loadPromise) return this.loadPromise;

    this._loadState.next('loading');
    this._loadError.next(null);

    this.loadPromise = this.doLoad();
    return this.loadPromise;
  }

  /**
   * Probes a video file to extract metadata (resolution, codec, duration).
   *
   * ── NOT IMPLEMENTED YET ──
   * Real probe logic (ffprobe via ffmpeg.ffprobe()) will be added in the
   * next step.
   *
   * @throws {Error} Always — "VideoProcessingService.probeVideo: not implemented yet"
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async probeVideo(_file: File): Promise<VideoProbeResult> {
    throw new Error(
      'VideoProcessingService.probeVideo: not implemented yet. ' +
        'Real probe logic will be added in the next step.',
    );
  }

  /**
   * Processes a video file per the PRD pipeline:
   *   detect resolution → downscale if >1080p → compress H.264 CRF 18.
   *
   * ── NOT IMPLEMENTED YET ──
   * Real transcoding logic will be added in the next step.
   *
   * @throws {Error} Always — "VideoProcessingService.processVideo: not implemented yet"
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async processVideo(_request: VideoProcessingRequest): Promise<VideoProcessingResult> {
    throw new Error(
      'VideoProcessingService.processVideo: not implemented yet. ' +
        'Real transcoding logic (H.264 CRF 18, 1080p downscale) will be added in the next step.',
    );
  }

  /**
   * Releases the ffmpeg instance and resets the service to idle.
   * Called automatically on service destroy; may also be called manually
   * to free WASM memory between large processing sessions.
   */
  teardown(): void {
    if (this.ffmpegInstance) {
      // Terminate the web worker spawned by ffmpeg.wasm.
      (this.ffmpegInstance as { terminate?: () => void }).terminate?.();
      this.ffmpegInstance = null;
    }
    this.loadPromise = null;
    this._loadState.next('idle');
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /**
   * Performs the actual WASM load via a dynamic import of @ffmpeg/ffmpeg.
   *
   * Uses a dynamic import so the ~30 MB WASM binary is only fetched when
   * the user has video files in the queue, not at app startup.
   *
   * The @ffmpeg/ffmpeg package exports `"node": "./dist/esm/empty.mjs"` so
   * in Jest/Node environments the import resolves to an empty module. We
   * guard against this by checking that FFmpeg is a real constructor before
   * proceeding, and transition to 'failed' gracefully if it is not.
   */
  private async doLoad(): Promise<void> {
    try {
      // Dynamic import — resolved by the Angular bundler in the browser,
      // and to an empty module in Node/Jest (handled below).
      const ffmpegModule = await import('@ffmpeg/ffmpeg');
      const FFmpegClass = ffmpegModule.FFmpeg;

      // Guard: in Node/Jest the module is empty, so FFmpeg will be undefined.
      if (typeof FFmpegClass !== 'function') {
        throw new Error(
          'ffmpeg.wasm is not available in this environment ' +
            '(running in Node or a test context).',
        );
      }

      const ffmpeg = new FFmpegClass();

      // Wire progress events into the public progress$ stream.
      // The @ffmpeg/ffmpeg v0.12 progress event uses `progress` (0–1), not `ratio`.
      ffmpeg.on('progress', ({ progress, time }: { progress: number; time: number }) => {
        this._progress.next({ ratio: progress, time });
      });

      // Load the multi-threaded WASM core from the unpkg CDN.
      // All three URLs are required for the MT variant.
      await ffmpeg.load({
        coreURL: `${CORE_MT_BASE}/ffmpeg-core.js`,
        wasmURL: `${CORE_MT_BASE}/ffmpeg-core.wasm`,
        workerURL: `${CORE_MT_BASE}/ffmpeg-core.worker.js`,
      });

      this.ffmpegInstance = ffmpeg;
      this._loadState.next('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown ffmpeg load error.';
      this._loadError.next(message);
      this._loadState.next('failed');
      this.loadPromise = null;
    }
  }
}
