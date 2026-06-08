import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import {
  FfmpegLoadState,
  FfmpegProgress,
  FileSplitResult,
  MAX_CHUNK_BYTES,
  MAX_VIDEO_HEIGHT_PX,
  VideoChunk,
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
 * Maximum milliseconds the ffmpeg.exec() call is allowed to run before we
 * abort and surface a "timed out" error.  90 s covers even large 4K files on
 * a slow machine while still failing fast for stalled instances.
 */
export const FFMPEG_EXEC_TIMEOUT_MS = 90_000;

/**
 * Internal helper — exported only for unit-testing the timeout path.
 * Creates a Promise that rejects after `ms` milliseconds with a descriptive
 * timeout error message.
 */
export function createExecTimeoutPromise(ms: number, filename: string): Promise<never> {
  return new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            `ffmpeg timed out after ${ms / 1000}s while processing "${filename}". ` +
              'The file may be too large or the encoder stalled.',
          ),
        ),
      ms,
    ),
  );
}

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
 * • processVideo() implements the full PRD pipeline:
 *     - H.264 (libx264), CRF 18.
 *     - Downscale to 1080p max height when source exceeds it (aspect preserved).
 *     - Progress events flow through progress$.
 *
 * ── PRD pipeline ──────────────────────────────────────────────────────────
 *   1. ✅ Probe: read resolution, codec, duration, bitrate.
 *   2. ✅ Transcode: H.264 CRF 18, downscale to 1080p if needed.
 *   3. (Later) Split: if output > 100 MB, chunk for multipart upload.
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
   *   - Probe the file to determine resolution and codec.
   *   - **Skip transcode** when the file is already H.264 and does not need
   *     downscaling — return the original file immediately.
   *   - Otherwise: H.264 (libx264) CRF 18, downscale to 1080p if needed.
   *   - Hard timeout of {@link FFMPEG_EXEC_TIMEOUT_MS} ms on the exec call so
   *     a stalled ffmpeg instance never leaves the queue stuck.
   *
   * Progress events are emitted through `progress$` during transcoding.
   *
   * @param request  Processing parameters (file, maxHeightPx, crf).
   * @returns        VideoProcessingResult with the output File and metadata.
   * @throws         When ffmpeg is not loaded, times out, or transcoding fails.
   */
  async processVideo(
    request: VideoProcessingRequest,
    /** Override the exec timeout — for unit-testing only. */
    execTimeoutMs = FFMPEG_EXEC_TIMEOUT_MS,
  ): Promise<VideoProcessingResult> {
    if (!this.isReady || !this.ffmpegInstance) {
      throw new Error(
        'VideoProcessingService.processVideo: ffmpeg is not loaded. ' +
          'Call load() and wait for loadState to become "ready" before processing.',
      );
    }

    const { file, maxHeightPx, crf } = request;

    // Use the pre-computed probe from the queue item when available so we
    // don't re-run a potentially slow/hanging ffprobe a second time.
    // Fall back to probeVideo() only when no probe was supplied.
    const probe = request.probe ?? (await this.probeVideo(file));

    // ── Fast path: skip transcode when not needed ────────────────────────────
    // A video is pass-through when:
    //   1. It is already H.264 (h264 / avc1 / avc) AND does not need downscaling.
    //   2. The codec is unknown (null) AND the file is an MP4 container AND
    //      does not need downscaling — MP4 files are overwhelmingly H.264 in
    //      practice (WhatsApp, iPhone, Android all produce H.264 MP4), and
    //      running a full re-encode on an unknown-codec MP4 under 1080p is
    //      far more likely to cause a hang than to improve compatibility.
    //
    // To force a transcode, the caller must explicitly pass a known non-H264 codec.
    const isAlreadyH264 =
      probe.codec === 'h264' || probe.codec === 'avc1' || probe.codec === 'avc';
    const isMp4Container = file.type === 'video/mp4';
    const isLikelyCompatible = isAlreadyH264 || (probe.codec === null && isMp4Container);

    if (isLikelyCompatible && !probe.requiresDownscale) {
      return {
        outputFile: file,
        wasTranscoded: false,
        outputSizeBytes: file.size,
        probe,
      };
    }

    // ── Transcode path ───────────────────────────────────────────────────────
    const ffmpeg = this.ffmpegInstance as {
      writeFile: (path: string, data: Uint8Array) => Promise<unknown>;
      exec: (args: string[], timeout?: number) => Promise<number>;
      readFile: (path: string, encoding?: string) => Promise<string | Uint8Array>;
      deleteFile: (path: string) => Promise<unknown>;
    };

    // Use a timestamp-based name to avoid collisions when multiple files
    // are processed concurrently (each gets its own FS namespace).
    const ts = Date.now();
    const ext = file.name.split('.').pop() ?? 'mp4';
    const inputName = `input_${ts}.${ext}`;
    const outputName = `output_${ts}.mp4`;

    try {
      // Write the source file into the ffmpeg virtual FS.
      const buffer = await file.arrayBuffer();
      await ffmpeg.writeFile(inputName, new Uint8Array(buffer));

      // Build the ffmpeg argument list.
      // -vf scale: use -2 on width so it stays divisible by 2 (required by libx264).
      // When no downscale is needed, omit the scale filter entirely.
      const args: string[] = ['-i', inputName];

      if (probe.requiresDownscale) {
        const targetH = Math.min(maxHeightPx, MAX_VIDEO_HEIGHT_PX);
        args.push('-vf', `scale=-2:${targetH}`);
      }

      args.push(
        '-c:v',
        'libx264',
        '-crf',
        String(crf),
        '-preset',
        'fast', // balance speed vs. compression
        '-c:a',
        'aac', // re-encode audio to AAC for broad compatibility
        '-movflags',
        '+faststart', // move moov atom to front for streaming
        outputName,
      );

      // Race the exec call against a hard timeout so a hung ffmpeg instance
      // never leaves the queue stuck in "Compressing…" indefinitely.
      const execPromise = ffmpeg.exec(args);
      const exitCode = await Promise.race([execPromise, createExecTimeoutPromise(execTimeoutMs, file.name)]);
      if (exitCode !== 0) {
        throw new Error(`ffmpeg exited with code ${exitCode} while processing "${file.name}".`);
      }

      // Read the output file from the virtual FS.
      const outputData = await ffmpeg.readFile(outputName);
      const outputBytes =
        outputData instanceof Uint8Array ? outputData : new TextEncoder().encode(outputData);

      const outputFile = new File([outputBytes as Uint8Array<ArrayBuffer>], outputName, {
        type: 'video/mp4',
      });

      // Re-probe the output to get accurate output metadata.
      const outputProbe = await this.probeNative(outputFile);
      const outputProbeResult: VideoProbeResult = {
        durationSeconds: outputProbe.durationSeconds,
        width: outputProbe.width,
        height: outputProbe.height,
        codec: 'h264',
        bitrate: null, // not re-probed via ffprobe to keep this step fast
        requiresDownscale: false,
        targetMaxHeightPx: outputProbe.height,
      };

      return {
        outputFile,
        wasTranscoded: true,
        outputSizeBytes: outputBytes.byteLength,
        probe: outputProbeResult,
      };
    } finally {
      // Always clean up virtual FS entries — even on timeout or error —
      // so WASM memory is not leaked between processing attempts.
      await ffmpeg.deleteFile(inputName).catch(() => undefined);
      await ffmpeg.deleteFile(outputName).catch(() => undefined);
    }
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

  /**
   * Splits a File into sequential chunks of at most MAX_CHUNK_BYTES (100 MB).
   *
   * Uses `File.slice()` (synchronous, zero-copy in modern browsers) so this
   * method is fast and does not require ffmpeg to be loaded.
   *
   * Returns a {@link FileSplitResult} with a client-generated `mediaId` UUID
   * that ties all chunks to one logical media item, plus the ordered chunk list.
   *
   * When the file is ≤ MAX_CHUNK_BYTES, a single-chunk result is returned
   * (`wasSplit === false`) so callers can use a uniform code path.
   *
   * @param file       The File to split (typically the processedFile output).
   * @param chunkSize  Maximum bytes per chunk. Defaults to MAX_CHUNK_BYTES.
   */
  splitFile(file: File, chunkSize = MAX_CHUNK_BYTES): FileSplitResult {
    const totalFileSize = file.size;
    const totalParts = Math.ceil(totalFileSize / chunkSize);
    const mediaId = crypto.randomUUID();

    const chunks: VideoChunk[] = [];

    for (let i = 0; i < totalParts; i++) {
      const byteOffset = i * chunkSize;
      const end = Math.min(byteOffset + chunkSize, totalFileSize);
      const blob = file.slice(byteOffset, end, file.type);
      const chunkFile = new File([blob], `${file.name}.part${i + 1}of${totalParts}`, {
        type: file.type,
      });

      chunks.push({
        partIndex: i,
        totalParts,
        file: chunkFile,
        sizeBytes: chunkFile.size,
        byteOffset,
      });
    }

    return { mediaId, totalFileSize, chunks, wasSplit: totalParts > 1 };
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
   * Has a hard 15 s timeout — ffprobe on a small file should be near-instant,
   * so if it stalls we bail and return nulls rather than blocking the pipeline.
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

      await Promise.race([
        ffmpeg.ffprobe([
          '-v',
          'quiet',
          '-print_format',
          'json',
          '-show_streams',
          '-show_format',
          inputName,
          '-o',
          outputName,
        ]),
        // 15 s hard cap — ffprobe on any reasonably-sized file should finish
        // in under a second; if it stalls we return nulls and move on.
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('ffprobe timed out')), 15_000),
        ),
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
