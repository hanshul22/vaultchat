import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import {
  FfmpegLoadState,
  FfmpegProgress,
  MAX_VIDEO_HEIGHT_PX,
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
 * • probeVideo() uses a hybrid approach:
 *     1. HTMLVideoElement (always available) → width, height, duration.
 *     2. ffprobe via ffmpeg.wasm (when loaded) → codec, bitrate.
 *   This ensures probe results are available even when ffmpeg fails to load.
 * • processVideo() remains a stub — transcoding is implemented in the next step.
 *
 * ── PRD pipeline (next step) ──────────────────────────────────────────────
 *   1. ✅ Probe: read resolution, codec, duration, bitrate.
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
   * Probes a video file to extract metadata needed for the processing decision.
   *
   * Uses a hybrid approach for maximum reliability:
   *   1. HTMLVideoElement (browser-native, always available) → width, height, duration.
   *   2. ffprobe via ffmpeg.wasm (when loaded) → codec, bitrate.
   *
   * The result always includes `requiresDownscale` and `targetMaxHeightPx`
   * so the next step can decide whether to transcode without re-reading the file.
   *
   * @param file  The video File to probe.
   * @returns     Populated VideoProbeResult.
   * @throws      When the browser cannot load the video metadata at all.
   */
  async probeVideo(file: File): Promise<VideoProbeResult> {
    // Step 1 — native browser metadata (fast, no WASM required).
    const native = await this.probeNative(file);

    // Step 2 — ffprobe for codec/bitrate (best-effort, skipped when not ready).
    let codec: string | null = null;
    let bitrate: number | null = null;

    if (this.isReady && this.ffmpegInstance) {
      try {
        const ffprobeResult = await this.runFfprobe(file);
        codec = ffprobeResult.codec;
        bitrate = ffprobeResult.bitrate;
      } catch {
        // ffprobe failure is non-fatal — codec/bitrate remain null.
      }
    }

    const height = native.height;
    const requiresDownscale = height !== null && height > MAX_VIDEO_HEIGHT_PX;

    return {
      durationSeconds: native.durationSeconds,
      width: native.width,
      height,
      codec,
      bitrate,
      requiresDownscale,
      targetMaxHeightPx: requiresDownscale ? MAX_VIDEO_HEIGHT_PX : height,
    };
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
      (this.ffmpegInstance as { terminate?: () => void }).terminate?.();
      this.ffmpegInstance = null;
    }
    this.loadPromise = null;
    this._loadState.next('idle');
  }

  // ── Private — loader ─────────────────────────────────────────────────────

  private async doLoad(): Promise<void> {
    try {
      const ffmpegModule = await import('@ffmpeg/ffmpeg');
      const FFmpegClass = ffmpegModule.FFmpeg;

      if (typeof FFmpegClass !== 'function') {
        throw new Error(
          'ffmpeg.wasm is not available in this environment ' +
            '(running in Node or a test context).',
        );
      }

      const ffmpeg = new FFmpegClass();

      ffmpeg.on('progress', ({ progress, time }: { progress: number; time: number }) => {
        this._progress.next({ ratio: progress, time });
      });

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

  // ── Private — probe helpers ───────────────────────────────────────────────

  /**
   * Reads width, height, and duration from the browser's native video element.
   * Creates a temporary object URL, loads it into a hidden <video>, reads the
   * metadata, then immediately revokes the URL to free memory.
   *
   * @throws When the browser fires an error event instead of loadedmetadata.
   */
  private probeNative(
    file: File,
  ): Promise<{ width: number | null; height: number | null; durationSeconds: number | null }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;

      const cleanup = (): void => {
        URL.revokeObjectURL(url);
        video.src = '';
        video.load();
      };

      video.addEventListener(
        'loadedmetadata',
        () => {
          const width = video.videoWidth || null;
          const height = video.videoHeight || null;
          const durationSeconds = isFinite(video.duration) ? video.duration : null;
          cleanup();
          resolve({ width, height, durationSeconds });
        },
        { once: true },
      );

      video.addEventListener(
        'error',
        () => {
          cleanup();
          reject(new Error(`Browser could not load video metadata for "${file.name}".`));
        },
        { once: true },
      );

      video.src = url;
    });
  }

  /**
   * Runs ffprobe on the file to extract codec and bitrate.
   *
   * Writes the file into the ffmpeg virtual FS, runs ffprobe with JSON output,
   * reads the result, then cleans up. Only called when ffmpeg is ready.
   *
   * Returns null for both fields when ffprobe output cannot be parsed.
   */
  private async runFfprobe(file: File): Promise<{ codec: string | null; bitrate: number | null }> {
    const ffmpeg = this.ffmpegInstance as {
      writeFile: (path: string, data: Uint8Array) => Promise<unknown>;
      ffprobe: (args: string[], timeout?: number) => Promise<number>;
      readFile: (path: string, encoding?: string) => Promise<string | Uint8Array>;
      deleteFile: (path: string) => Promise<unknown>;
    };

    const inputName = `probe_input_${Date.now()}`;
    const outputName = `probe_output_${Date.now()}.json`;

    try {
      const buffer = await file.arrayBuffer();
      await ffmpeg.writeFile(inputName, new Uint8Array(buffer));

      await ffmpeg.ffprobe([
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_streams',
        '-show_format',
        inputName,
        '-o',
        outputName,
      ]);

      const raw = await ffmpeg.readFile(outputName, 'utf8');
      const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as Uint8Array);

      return this.parseFfprobeJson(text);
    } finally {
      // Best-effort cleanup — ignore errors from deleteFile.
      await ffmpeg.deleteFile(inputName).catch(() => undefined);
      await ffmpeg.deleteFile(outputName).catch(() => undefined);
    }
  }

  /**
   * Parses the JSON output of ffprobe to extract codec name and bitrate.
   * Returns nulls for any field that cannot be found or parsed.
   */
  private parseFfprobeJson(json: string): { codec: string | null; bitrate: number | null } {
    try {
      const parsed = JSON.parse(json) as {
        streams?: Array<{ codec_name?: string; codec_type?: string }>;
        format?: { bit_rate?: string };
      };

      const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
      const codec = videoStream?.codec_name ?? null;

      const bitrateStr = parsed.format?.bit_rate;
      const bitrate = bitrateStr != null && bitrateStr !== '' ? parseInt(bitrateStr, 10) : null;

      return {
        codec: codec ?? null,
        bitrate: bitrate !== null && !isNaN(bitrate) ? bitrate : null,
      };
    } catch {
      return { codec: null, bitrate: null };
    }
  }
}
