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
 * Reason a video processing operation was skipped or deferred.
 * Used by the service to communicate why it returned the original file.
 */
export type ProcessingSkipReason =
  | 'ffmpeg_not_ready' // Engine not yet loaded
  | 'not_implemented' // Method stub — real logic comes in the next step
  | 'no_transcoding_needed'; // File already meets quality/size requirements
