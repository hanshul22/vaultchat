/**
 * Lifecycle state of the ffmpeg.wasm engine inside the browser.
 *
 * Transitions:
 *   idle → loading → ready      (successful lazy-load)
 *   idle → loading → failed     (WASM load error)
 *   ready → idle                (after explicit teardown, if ever needed)
 */
export type FfmpegLoadState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Progress event emitted by the ffmpeg.wasm engine during a processing
 * operation. Mirrors the shape of the `progress` callback in @ffmpeg/ffmpeg.
 */
export interface FfmpegProgress {
  /** Ratio of work completed, 0–1. May be NaN for indeterminate operations. */
  ratio: number;
  /** Elapsed time in seconds reported by ffmpeg. */
  time: number;
}

/** Maximum height (px) above which a video requires downscaling. Per PRD: 1080. */
export const MAX_VIDEO_HEIGHT_PX = 1080;

/** H.264 CRF value for compression quality. Per PRD: 18. */
export const VIDEO_CRF = 18;

/**
 * Per-file processing progress, emitted while ffmpeg is transcoding.
 * Extends FfmpegProgress with a human-readable stage label.
 */
export interface VideoProcessingProgress {
  /** Ratio of work completed, 0–1. May be NaN for indeterminate operations. */
  ratio: number;
  /** Elapsed time in seconds reported by ffmpeg. */
  time: number;
  /** Human-readable stage label shown in the UI. */
  stage: 'transcoding';
}

/**
 * Metadata extracted from a video file by the probe step.
 *
 * Width, height, and duration are always populated (via the browser's native
 * HTMLVideoElement API). Codec and bitrate are populated only when ffmpeg is
 * available and ffprobe succeeds; they are null otherwise.
 *
 * The `requiresDownscale` and `targetMaxHeightPx` fields are derived from
 * the probe result and drive the next processing decision.
 */
export interface VideoProbeResult {
  /** Duration in seconds, or null when not determinable. */
  durationSeconds: number | null;
  /** Width of the primary video stream in pixels, or null. */
  width: number | null;
  /** Height of the primary video stream in pixels, or null. */
  height: number | null;
  /**
   * Detected codec name, e.g. "h264", "hevc", "vp9".
   * Null when ffprobe was not available or did not return a value.
   */
  codec: string | null;
  /**
   * Bit-rate in bits per second.
   * Null when ffprobe was not available or did not return a value.
   */
  bitrate: number | null;
  /**
   * True when the video height exceeds MAX_VIDEO_HEIGHT_PX (1080) and the
   * transcoding step must downscale it.
   */
  requiresDownscale: boolean;
  /**
   * The target height for the transcoding step.
   * MAX_VIDEO_HEIGHT_PX when requiresDownscale is true; the source height
   * (or null if unknown) when no downscale is needed.
   */
  targetMaxHeightPx: number | null;
}

/**
 * Input contract for VideoProcessingService.processVideo().
 *
 * Describes the desired output characteristics. The service decides whether
 * transcoding is actually needed based on the probe result.
 */
export interface VideoProcessingRequest {
  /** The raw browser File to process. */
  file: File;
  /**
   * Maximum output height in pixels. The service will downscale if the source
   * exceeds this value (maintaining aspect ratio). Per PRD: 1080.
   */
  maxHeightPx: number;
  /**
   * H.264 CRF value for quality/size trade-off. Lower = better quality,
   * larger file. Per PRD: 18.
   */
  crf: number;
  /**
   * Pre-computed probe result from the probe step.
   * When provided, processVideo() uses this directly and skips an internal
   * re-probe, avoiding a redundant (and potentially slow) ffprobe run.
   */
  probe?: VideoProbeResult | null;
}

/**
 * Result returned by VideoProcessingService.processVideo() on success.
 */
export interface VideoProcessingResult {
  /**
   * The processed video as a browser File, ready for upload.
   * May be the original file unchanged if no transcoding was needed.
   */
  outputFile: File;
  /** True when the file was actually transcoded; false when passed through. */
  wasTranscoded: boolean;
  /** Output file size in bytes. */
  outputSizeBytes: number;
  /** Probe metadata of the output file. */
  probe: VideoProbeResult;
}

/**
 * Reason a video processing operation was skipped.
 * Used by the service to communicate why it returned the original file.
 */
export type ProcessingSkipReason =
  | 'ffmpeg_not_ready' // Engine not yet loaded
  | 'no_transcoding_needed'; // File already meets quality/size requirements

// ── Chunk splitting ───────────────────────────────────────────────────────────

/** Maximum bytes per chunk sent to POST /api/v1/media/upload. Per PRD: 100 MB. */
export const MAX_CHUNK_BYTES = 100 * 1024 * 1024;

/**
 * A single chunk produced by VideoProcessingService.splitFile().
 *
 * Each chunk is a browser Blob slice of the source file, wrapped in a File
 * so it can be appended to FormData with a meaningful name.
 */
export interface VideoChunk {
  /** 0-based index of this chunk within the logical file. */
  partIndex: number;
  /** Total number of chunks for this logical file. */
  totalParts: number;
  /** The chunk data as a File (MIME type matches the source). */
  file: File;
  /** Byte size of this chunk. */
  sizeBytes: number;
  /** Byte offset of this chunk within the original file. */
  byteOffset: number;
}

/**
 * Result of VideoProcessingService.splitFile().
 */
export interface FileSplitResult {
  /** Client-generated UUID that ties all chunks to one logical media item. */
  mediaId: string;
  /** Total byte size of the original (unsplit) file. */
  totalFileSize: number;
  /** Ordered list of chunks ready for sequential upload. */
  chunks: VideoChunk[];
  /** True when the file was actually split (> 1 chunk). */
  wasSplit: boolean;
}
