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
 * Manages the ffmpeg.wasm engine lifecycle and exposes the video-processing
 * contract for the upload pipeline.
 *
 * ── Architecture notes ────────────────────────────────────────────────────
 * • ffmpeg.wasm is lazy-loaded on first demand (not at app startup) to avoid
 *   blocking the initial page load with a ~30 MB WASM binary.
 * • The multi-threaded core (@ffmpeg/core-mt) is used when SharedArrayBuffer
 *   is available (requires COOP/COEP headers); the service falls back to the
 *   single-threaded core otherwise. That fallback is wired in the next step.
 * • probeVideo() and processVideo() are stubs in this step. They throw a
 *   clearly labelled "not implemented" error so callers can detect the
 *   boundary and the next step can fill in the real logic without touching
 *   the service interface.
 *
 * ── PRD pipeline (to be implemented in the next step) ────────────────────
 *   1. Probe: read resolution, codec, duration, bitrate.
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
   * The lazily-created ffmpeg instance. Typed as `unknown` here because
   * @ffmpeg/ffmpeg is not yet installed; the next step will replace this
   * with the proper `FFmpeg` type once the package is available.
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

  /**
   * Returns a snapshot of the current load state without subscribing.
   */
  get loadState(): FfmpegLoadState {
    return this._loadState.getValue();
  }

  /**
   * Returns true when the engine is loaded and ready to process files.
   */
  get isReady(): boolean {
    return this._loadState.getValue() === 'ready';
  }

  /**
   * Lazy-loads the ffmpeg.wasm engine.
   *
   * Safe to call multiple times — concurrent calls share the same promise.
   * Resolves immediately when the engine is already loaded.
   *
   * The actual dynamic import of @ffmpeg/ffmpeg and @ffmpeg/core-mt is
   * implemented here as a skeleton. The real import will be filled in once
   * the packages are installed and the next step wires the WASM URLs.
   *
   * @throws Never — load errors are captured and surfaced via loadState$.
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
   * This stub is provided so the upload pipeline can call it and receive a
   * clear "not implemented" signal. Real probe logic (ffprobe via ffmpeg -i)
   * will be added in the next step.
   *
   * @throws {Error} Always — with message "VideoProcessingService.probeVideo: not implemented yet".
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async probeVideo(_file: File): Promise<VideoProbeResult> {
    throw new Error(
      'VideoProcessingService.probeVideo: not implemented yet. ' +
        'Real probe logic will be added in the next step.',
    );
  }

  /**
   * Processes a video file according to the PRD pipeline:
   *   detect resolution → downscale if >1080p → compress H.264 CRF 18.
   *
   * ── NOT IMPLEMENTED YET ──
   * This stub is provided so the upload pipeline can call it and receive a
   * clear "not implemented" signal. Real transcoding logic will be added in
   * the next step.
   *
   * @throws {Error} Always — with message "VideoProcessingService.processVideo: not implemented yet".
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
      // When the real FFmpeg class is wired in, call ffmpeg.terminate() here.
      this.ffmpegInstance = null;
    }
    this.loadPromise = null;
    this._loadState.next('idle');
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /**
   * Performs the actual WASM load.
   *
   * Skeleton implementation — the dynamic import of @ffmpeg/ffmpeg and the
   * WASM binary URL configuration will be filled in once the packages are
   * installed in the next step.
   */
  private async doLoad(): Promise<void> {
    try {
      // ── SKELETON ─────────────────────────────────────────────────────────
      // Replace this block in the next step with:
      //
      //   const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      //   const { toBlobURL } = await import('@ffmpeg/util');
      //
      //   const ffmpeg = new FFmpeg();
      //   ffmpeg.on('progress', ({ ratio, time }) =>
      //     this._progress.next({ ratio, time }),
      //   );
      //
      //   const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/esm';
      //   await ffmpeg.load({
      //     coreURL:   await toBlobURL(`${baseURL}/ffmpeg-core.js`,   'text/javascript'),
      //     wasmURL:   await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      //     workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
      //   });
      //
      //   this.ffmpegInstance = ffmpeg;
      //   this._loadState.next('ready');
      // ─────────────────────────────────────────────────────────────────────

      // For now, mark as failed with a clear "not yet wired" message so the
      // UI can surface the correct state without silently hanging.
      throw new Error(
        'ffmpeg.wasm is not yet wired. ' +
          'Install @ffmpeg/ffmpeg and @ffmpeg/core-mt, then replace this skeleton.',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown ffmpeg load error.';
      this._loadError.next(message);
      this._loadState.next('failed');
      this.loadPromise = null;
    }
  }
}
