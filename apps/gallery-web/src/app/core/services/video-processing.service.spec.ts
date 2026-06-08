/**
 * Unit tests for VideoProcessingService.
 *
 * Focus areas per Phase 12:
 *  1. processVideo() fast-path: skip transcode for H.264 files and unknown-
 *     codec MP4 files that don't need downscaling.
 *  2. processVideo() transcode path: calls ffmpeg.exec() and returns a result.
 *  3. processVideo() failure path: surfaces a clear error when exec fails.
 *  4. Timeout: rejects with a descriptive message when ffmpeg.exec() stalls.
 *  5. Cleanup: deleteFile() is always called even on failure / timeout.
 *  6. Pre-computed probe is used when supplied — no redundant probeVideo call.
 */

import { TestBed } from '@angular/core/testing';
import { VideoProcessingService } from './video-processing.service';
import { MAX_VIDEO_HEIGHT_PX, VIDEO_CRF, VideoProbeResult } from '../models/video-processing.model';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Creates a minimal mp4 File for tests that hit the fast path. */
function makeMp4File(name = 'test.mp4', size = 1024): File {
  const file = new File([new Uint8Array(size)], name, { type: 'video/mp4' });
  stubArrayBuffer(file, size);
  return file;
}

/** Creates a QuickTime .mov File for tests that must go through the transcode path. */
function makeMovFile(name = 'clip.mov', size = 1024): File {
  const file = new File([new Uint8Array(size)], name, { type: 'video/quicktime' });
  stubArrayBuffer(file, size);
  return file;
}

/** jsdom's File doesn't implement arrayBuffer() — patch it. */
function stubArrayBuffer(file: File, size: number): void {
  Object.defineProperty(file, 'arrayBuffer', {
    value: jest.fn().mockResolvedValue(new ArrayBuffer(size)),
    configurable: true,
  });
}

/** Minimal stub satisfying the ffmpeg instance shape used by the service. */
function makeFfmpegStub(overrides: Partial<{
  exec: jest.Mock;
  writeFile: jest.Mock;
  readFile: jest.Mock;
  deleteFile: jest.Mock;
  on: jest.Mock;
  terminate: jest.Mock;
}> = {}): Record<string, jest.Mock> {
  return {
    writeFile: jest.fn().mockResolvedValue(undefined),
    exec: jest.fn().mockResolvedValue(0),
    readFile: jest.fn().mockResolvedValue(new Uint8Array(8)),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    terminate: jest.fn(),
    ...overrides,
  };
}

/** A probe result representing a 720p file that needs no downscale. */
function makeProbe(overrides: Partial<VideoProbeResult> = {}): VideoProbeResult {
  return {
    durationSeconds: 10,
    width: 1280,
    height: 720,
    codec: null,
    bitrate: null,
    requiresDownscale: false,
    targetMaxHeightPx: 720,
    ...overrides,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('VideoProcessingService', () => {
  let service: VideoProcessingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VideoProcessingService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  /** Inject a fake ffmpeg instance and set state to 'ready'. */
  function injectFfmpeg(stub: Record<string, jest.Mock>): void {
    (service as unknown as { ffmpegInstance: unknown }).ffmpegInstance = stub;
    (service as unknown as { _loadState: { next: (v: string) => void } })._loadState.next('ready');
  }

  /** Stub probeVideo so tests don't need a real browser video element. */
  function stubProbeVideo(probe: Partial<VideoProbeResult> = {}): void {
    jest.spyOn(service, 'probeVideo').mockResolvedValue(makeProbe(probe));
  }

  /** Stub probeNative — called after a successful transcode for output metadata. */
  function stubProbeNative(): void {
    jest.spyOn(
      service as unknown as { probeNative: (f: File) => Promise<unknown> },
      'probeNative',
    ).mockResolvedValue({ width: 1280, height: 720, durationSeconds: 10 });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. Not-ready guard
  // ══════════════════════════════════════════════════════════════════════════

  it('throws when ffmpeg is not ready', async () => {
    await expect(
      service.processVideo({ file: makeMp4File(), maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF }),
    ).rejects.toThrow('ffmpeg is not loaded');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. Fast path — skip transcode
  // ══════════════════════════════════════════════════════════════════════════

  describe('fast path (skip transcode)', () => {
    it('skips exec when codec is h264 and no downscale needed', async () => {
      const stub = makeFfmpegStub();
      injectFfmpeg(stub);
      stubProbeVideo({ codec: 'h264' });

      const file = makeMp4File();
      const result = await service.processVideo({ file, maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF });

      expect(result.outputFile).toBe(file);
      expect(result.wasTranscoded).toBe(false);
      expect(stub.exec).not.toHaveBeenCalled();
      expect(stub.writeFile).not.toHaveBeenCalled();
    });

    it('skips exec when codec is "avc1"', async () => {
      const stub = makeFfmpegStub();
      injectFfmpeg(stub);
      stubProbeVideo({ codec: 'avc1' });

      const result = await service.processVideo({ file: makeMp4File(), maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF });
      expect(result.wasTranscoded).toBe(false);
      expect(stub.exec).not.toHaveBeenCalled();
    });

    it('skips exec when codec is "avc"', async () => {
      const stub = makeFfmpegStub();
      injectFfmpeg(stub);
      stubProbeVideo({ codec: 'avc' });

      const result = await service.processVideo({ file: makeMp4File(), maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF });
      expect(result.wasTranscoded).toBe(false);
      expect(stub.exec).not.toHaveBeenCalled();
    });

    it('skips exec for unknown-codec MP4 (WhatsApp / Android fast path)', async () => {
      const stub = makeFfmpegStub();
      injectFfmpeg(stub);
      stubProbeVideo({ codec: null }); // codec unknown — MP4 container assumed H.264

      const result = await service.processVideo({ file: makeMp4File('whatsapp.mp4'), maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF });
      expect(result.wasTranscoded).toBe(false);
      expect(stub.exec).not.toHaveBeenCalled();
    });

    it('uses pre-supplied probe and skips probeVideo call', async () => {
      const stub = makeFfmpegStub();
      injectFfmpeg(stub);
      const probeVideoSpy = jest.spyOn(service, 'probeVideo');

      const result = await service.processVideo({
        file: makeMp4File('already-h264.mp4'),
        maxHeightPx: MAX_VIDEO_HEIGHT_PX,
        crf: VIDEO_CRF,
        probe: makeProbe({ codec: 'h264' }),
      });

      expect(probeVideoSpy).not.toHaveBeenCalled();
      expect(result.wasTranscoded).toBe(false);
      expect(stub.exec).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. Transcode path — when exec IS needed
  //
  // All transcode tests use a .mov (QuickTime) file with codec=null so the
  // fast-path conditions are not satisfied.
  // ══════════════════════════════════════════════════════════════════════════

  describe('transcode path', () => {
    it('transcodes when codec is hevc (not H.264)', async () => {
      const stub = makeFfmpegStub();
      injectFfmpeg(stub);
      stubProbeVideo({ codec: 'hevc' });
      stubProbeNative();

      const result = await service.processVideo({ file: makeMp4File(), maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF });
      expect(stub.exec).toHaveBeenCalled();
      expect(result.wasTranscoded).toBe(true);
    });

    it('transcodes when h264 but downscale IS needed', async () => {
      const stub = makeFfmpegStub();
      injectFfmpeg(stub);
      stubProbeVideo({ codec: 'h264', requiresDownscale: true, height: 2160 });
      stubProbeNative();

      const result = await service.processVideo({ file: makeMp4File(), maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF });
      expect(stub.exec).toHaveBeenCalled();
      expect(result.wasTranscoded).toBe(true);
    });

    it('transcodes when codec is null and file is not an MP4 (.mov)', async () => {
      const stub = makeFfmpegStub();
      injectFfmpeg(stub);
      stubProbeVideo({ codec: null });
      stubProbeNative();

      const result = await service.processVideo({ file: makeMovFile(), maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF });
      expect(stub.exec).toHaveBeenCalled();
      expect(result.wasTranscoded).toBe(true);
    });

    it('writes, execs, reads and returns correct output size', async () => {
      const stub = makeFfmpegStub({ readFile: jest.fn().mockResolvedValue(new Uint8Array(512)) });
      injectFfmpeg(stub);
      stubProbeVideo({ codec: 'hevc' });
      stubProbeNative();

      const result = await service.processVideo({ file: makeMp4File(), maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF });

      expect(stub.writeFile).toHaveBeenCalledTimes(1);
      expect(stub.exec).toHaveBeenCalledTimes(1);
      expect(stub.readFile).toHaveBeenCalledTimes(1);
      expect(result.outputSizeBytes).toBe(512);
    });

    it('includes -vf scale when downscale is needed', async () => {
      const stub = makeFfmpegStub();
      injectFfmpeg(stub);
      stubProbeVideo({ codec: 'hevc', requiresDownscale: true, height: 2160 });
      stubProbeNative();

      await service.processVideo({ file: makeMp4File(), maxHeightPx: 1080, crf: VIDEO_CRF });

      const args: string[] = stub.exec.mock.calls[0][0];
      const vfIdx = args.indexOf('-vf');
      expect(vfIdx).toBeGreaterThan(-1);
      expect(args[vfIdx + 1]).toMatch(/scale=-2:1080/);
    });

    it('omits -vf scale when no downscale is needed', async () => {
      const stub = makeFfmpegStub();
      injectFfmpeg(stub);
      stubProbeVideo({ codec: 'hevc', requiresDownscale: false });
      stubProbeNative();

      await service.processVideo({ file: makeMovFile(), maxHeightPx: 1080, crf: VIDEO_CRF });

      const args: string[] = stub.exec.mock.calls[0][0];
      expect(args).not.toContain('-vf');
    });

    it('passes libx264 / CRF / preset / aac / faststart args', async () => {
      const stub = makeFfmpegStub();
      injectFfmpeg(stub);
      stubProbeVideo({ codec: 'hevc' });
      stubProbeNative();

      await service.processVideo({ file: makeMovFile(), maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF });

      const args: string[] = stub.exec.mock.calls[0][0];
      expect(args).toContain('libx264');
      expect(args).toContain(String(VIDEO_CRF));
      expect(args).toContain('aac');
      expect(args).toContain('+faststart');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. Failure path
  // ══════════════════════════════════════════════════════════════════════════

  it('throws a descriptive error when exec returns non-zero exit code', async () => {
    const stub = makeFfmpegStub({ exec: jest.fn().mockResolvedValue(1) });
    injectFfmpeg(stub);
    stubProbeVideo({ codec: 'hevc' });

    await expect(
      service.processVideo({ file: makeMovFile('bad.mov'), maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF }),
    ).rejects.toThrow('ffmpeg exited with code 1');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. Timeout
  // ══════════════════════════════════════════════════════════════════════════

  it('rejects with a timeout error when exec stalls (using short execTimeoutMs)', async () => {
    const neverResolve = new Promise<number>(() => { return; });
    const stub = makeFfmpegStub({ exec: jest.fn().mockReturnValue(neverResolve) });
    injectFfmpeg(stub);
    stubProbeVideo({ codec: 'hevc' }); // forces transcode path

    await expect(
      service.processVideo({ file: makeMovFile('hang.mov'), maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF }, 10),
    ).rejects.toThrow('timed out');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. Cleanup — deleteFile always called
  // ══════════════════════════════════════════════════════════════════════════

  it('calls deleteFile for both files even when exec throws', async () => {
    const stub = makeFfmpegStub({ exec: jest.fn().mockRejectedValue(new Error('crash')) });
    injectFfmpeg(stub);
    stubProbeVideo({ codec: 'hevc' });

    await expect(
      service.processVideo({ file: makeMovFile(), maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF }),
    ).rejects.toThrow();

    expect(stub.deleteFile).toHaveBeenCalledTimes(2);
  });

  it('calls deleteFile for both files on successful transcode', async () => {
    const stub = makeFfmpegStub();
    injectFfmpeg(stub);
    stubProbeVideo({ codec: 'hevc' });
    stubProbeNative();

    await service.processVideo({ file: makeMovFile(), maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF });

    expect(stub.deleteFile).toHaveBeenCalledTimes(2);
  });

  it('calls deleteFile even when exec times out', async () => {
    const neverResolve = new Promise<number>(() => { return; });
    const stub = makeFfmpegStub({ exec: jest.fn().mockReturnValue(neverResolve) });
    injectFfmpeg(stub);
    stubProbeVideo({ codec: 'hevc' });

    await expect(
      service.processVideo({ file: makeMovFile(), maxHeightPx: MAX_VIDEO_HEIGHT_PX, crf: VIDEO_CRF }, 10),
    ).rejects.toThrow('timed out');

    expect(stub.deleteFile).toHaveBeenCalledTimes(2);
  });
});
