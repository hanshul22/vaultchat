/**
 * Integration-level tests for the UploadsPageComponent upload pipeline.
 *
 * Focus: verify that the wiring between ffmpeg processing, splitting, and
 * UploadQueueService.executeDirectUpload() follows the correct PRD order:
 *   probe → preflight → process/compress → split → direct upload
 *
 * These tests do NOT cover template rendering or CSS — they only assert the
 * pipeline sequencing and that the old backend-proxy upload path is no longer used.
 */
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject } from 'rxjs';

import { UploadsPageComponent } from './uploads-page.component';
import { UploadService } from '../../core/services/upload.service';
import { VideoProcessingService } from '../../core/services/video-processing.service';
import { UploadQueueService, DIRECT_UPLOAD_MAX_CHUNK_SIZE_BYTES } from '../../uploads/data/upload-queue.service';
import { FileSplitResult } from '../../core/models/video-processing.model';
import { UploadTask } from '../../uploads/data/upload-task.model';
import { MediaUploadResponse } from '../../core/models/media-upload-response.model';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFile(name: string, size: number, type = 'image/jpeg'): File {
  return new File([new Uint8Array(size)], name, { type });
}

function makeMediaResponse(id = 'media-1'): MediaUploadResponse {
  return {
    id,
    ownerId: 'user-1',
    storageSpaceId: null,
    cloudinaryPublicId: `${id}__part_0`,
    url: `https://res.cloudinary.com/demo/${id}`,
    mimeType: 'image/jpeg',
    sizeBytes: '100',
    width: 100,
    height: 100,
    durationSeconds: null,
    createdAt: '2026-06-01T00:00:00.000Z',
  };
}

function makeTask(overrides: Partial<UploadTask> = {}): UploadTask {
  const now = new Date().toISOString();
  return {
    clientId: 'task-client-1',
    mediaId: 'media-1',
    filename: 'test.jpg',
    mimeType: 'image/jpeg',
    originalTotalBytes: 100,
    totalParts: 1,
    uploadedParts: [],
    compressedTotalBytes: null,
    preflightResult: null,
    directUploadSession: null,
    completedMedia: makeMediaResponse(),
    state: {
      phase: 'completed',
      preflightStatus: 'completed',
      sessionStatus: 'initialized',
      currentPartIndex: null,
      totalParts: 1,
      startedAt: now,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UploadsPageComponent — upload pipeline wiring', () => {
  let component: UploadsPageComponent;
  let uploadQueueService: jest.Mocked<UploadQueueService>;
  let uploadService: jest.Mocked<UploadService>;
  let videoProcessingService: jest.Mocked<VideoProcessingService>;

  const progress$ = new Subject<never>();

  beforeEach(() => {
    uploadQueueService = {
      addFile: jest.fn(),
      addFiles: jest.fn(),
      getTask: jest.fn(),
      getFile: jest.fn(),
      removeTask: jest.fn(),
      clear: jest.fn(),
      executeDirectUpload: jest.fn(),
      tasks: signal([]),
    } as unknown as jest.Mocked<UploadQueueService>;

    uploadService = {
      checkPreflight: jest.fn(),
      uploadFile: jest.fn(),
      uploadChunked: jest.fn(),
    } as unknown as jest.Mocked<UploadService>;

    videoProcessingService = {
      load: jest.fn().mockResolvedValue(undefined),
      probeVideo: jest.fn(),
      processVideo: jest.fn(),
      splitFile: jest.fn(),
      progress$,
      loadState$: of('ready' as const),
      loadState: 'ready' as const,
      isReady: true,
    } as unknown as jest.Mocked<VideoProcessingService>;

    TestBed.configureTestingModule({
      imports: [UploadsPageComponent],
      providers: [
        { provide: UploadQueueService, useValue: uploadQueueService },
        { provide: UploadService, useValue: uploadService },
        { provide: VideoProcessingService, useValue: videoProcessingService },
      ],
    });

    component = TestBed.createComponent(UploadsPageComponent).componentInstance;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── 1. Legacy upload path is NOT used by uploads-page execution ─────────────

  it('does not call UploadService.uploadFile for normal upload execution', async () => {
    const file = makeFile('photo.jpg', 100, 'image/jpeg');
    const task = makeTask({ clientId: 'task-client-1' });
    uploadQueueService.addFile.mockReturnValue(task);
    uploadQueueService.executeDirectUpload.mockResolvedValue(task);
    uploadService.checkPreflight.mockReturnValue(of({ canUpload: true as const, cloudName: 'demo', uploadFolder: 'v/u1', targetAccountId: 'acc1', targetAccountRole: 'primary' as const, targetSecondaryOrder: null }));

    // Manually add an item to the queue in 'ready' state (bypassing addFiles flow)
    (component as unknown as { queue: ReturnType<typeof signal> }).queue.set([
      {
        clientId: 'page-client-1',
        filename: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        status: 'ready',
        file,
      },
    ]);
    (component as unknown as { taskClientIdMap: Map<string, string> }).taskClientIdMap.set(
      'page-client-1',
      task.clientId,
    );

    await component.uploadOne('page-client-1');

    expect(uploadService.uploadFile).not.toHaveBeenCalled();
    expect(uploadService.uploadChunked).not.toHaveBeenCalled();
  });

  // ── 2. Unsplit file calls executeDirectUpload with processedFile ─────────────

  it('passes processedFile to executeDirectUpload for a single-part upload', async () => {
    const originalFile = makeFile('video.mp4', 10 * 1024 * 1024, 'video/mp4');
    const processedFile = makeFile('output_processed.mp4', 8 * 1024 * 1024, 'video/mp4');
    const task = makeTask({ clientId: 'task-client-1' });

    uploadQueueService.addFile.mockReturnValue(task);
    uploadQueueService.executeDirectUpload.mockResolvedValue(task);

    (component as unknown as { queue: ReturnType<typeof signal> }).queue.set([
      {
        clientId: 'page-client-1',
        filename: originalFile.name,
        sizeBytes: originalFile.size,
        mimeType: originalFile.type,
        status: 'ready',
        processedFile,
        file: originalFile,
      },
    ]);
    (component as unknown as { taskClientIdMap: Map<string, string> }).taskClientIdMap.set(
      'page-client-1',
      task.clientId,
    );

    await component.uploadOne('page-client-1');

    expect(uploadQueueService.executeDirectUpload).toHaveBeenCalledWith(
      task.clientId,
      expect.objectContaining({ processedFile }),
    );
    // parts should be absent / empty for a single-part upload
    const callArgs = uploadQueueService.executeDirectUpload.mock.calls[0]?.[1];
    expect(callArgs?.parts == null || callArgs?.parts?.length === 0).toBe(true);
  });

  it('passes original file when no processedFile is present', async () => {
    const file = makeFile('photo.jpg', 1 * 1024 * 1024, 'image/jpeg');
    const task = makeTask({ clientId: 'task-client-1' });

    uploadQueueService.addFile.mockReturnValue(task);
    uploadQueueService.executeDirectUpload.mockResolvedValue(task);

    (component as unknown as { queue: ReturnType<typeof signal> }).queue.set([
      {
        clientId: 'page-client-1',
        filename: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        status: 'ready',
        file,
      },
    ]);
    (component as unknown as { taskClientIdMap: Map<string, string> }).taskClientIdMap.set(
      'page-client-1',
      task.clientId,
    );

    await component.uploadOne('page-client-1');

    expect(uploadQueueService.executeDirectUpload).toHaveBeenCalledWith(
      task.clientId,
      expect.objectContaining({ processedFile: file }),
    );
  });

  // ── 3. Split outputs are passed to executeDirectUpload in correct order ──────

  it('passes sorted zero-based parts to executeDirectUpload for a chunked upload', async () => {
    const CHUNK = DIRECT_UPLOAD_MAX_CHUNK_SIZE_BYTES;
    // Simulate a file just over 1 chunk in size so splitFile would produce 2 parts
    const bigFile = makeFile('big-video.mp4', CHUNK + 1, 'video/mp4');
    const task = makeTask({ clientId: 'task-client-1' });

    const splitResult: FileSplitResult = {
      mediaId: 'media-split-1',
      totalFileSize: bigFile.size,
      wasSplit: true,
      chunks: [
        { partIndex: 0, totalParts: 2, file: makeFile('big-video.mp4.part1of2', CHUNK, 'video/mp4'), sizeBytes: CHUNK, byteOffset: 0 },
        { partIndex: 1, totalParts: 2, file: makeFile('big-video.mp4.part2of2', 1, 'video/mp4'), sizeBytes: 1, byteOffset: CHUNK },
      ],
    };

    uploadQueueService.addFile.mockReturnValue(task);
    uploadQueueService.executeDirectUpload.mockResolvedValue(task);
    videoProcessingService.splitFile.mockReturnValue(splitResult);

    (component as unknown as { queue: ReturnType<typeof signal> }).queue.set([
      {
        clientId: 'page-client-1',
        filename: bigFile.name,
        sizeBytes: bigFile.size,
        mimeType: bigFile.type,
        status: 'ready',
        file: bigFile,
      },
    ]);
    (component as unknown as { taskClientIdMap: Map<string, string> }).taskClientIdMap.set(
      'page-client-1',
      task.clientId,
    );

    await component.uploadOne('page-client-1');

    // splitFile must be called with the 95 MB cap, not 100 MB
    expect(videoProcessingService.splitFile).toHaveBeenCalledWith(bigFile, CHUNK);

    const [, options] = uploadQueueService.executeDirectUpload.mock.calls[0]!;
    expect(options?.parts).toHaveLength(2);
    // Parts must be zero-based and ordered
    expect(options?.parts?.[0]?.partIndex).toBe(0);
    expect(options?.parts?.[1]?.partIndex).toBe(1);
    expect(options?.parts?.[0]?.totalParts).toBe(2);
    expect(options?.parts?.[1]?.totalParts).toBe(2);
    expect(options?.parts?.[0]?.sizeBytes).toBe(CHUNK);
    expect(options?.parts?.[1]?.sizeBytes).toBe(1);
  });

  it('does not pass parts when the file fits in a single chunk', async () => {
    const smallFile = makeFile('img.jpg', 1000, 'image/jpeg');
    const task = makeTask({ clientId: 'task-client-1' });

    uploadQueueService.addFile.mockReturnValue(task);
    uploadQueueService.executeDirectUpload.mockResolvedValue(task);

    (component as unknown as { queue: ReturnType<typeof signal> }).queue.set([
      {
        clientId: 'page-client-1',
        filename: smallFile.name,
        sizeBytes: smallFile.size,
        mimeType: smallFile.type,
        status: 'ready',
        file: smallFile,
      },
    ]);
    (component as unknown as { taskClientIdMap: Map<string, string> }).taskClientIdMap.set(
      'page-client-1',
      task.clientId,
    );

    await component.uploadOne('page-client-1');

    expect(videoProcessingService.splitFile).not.toHaveBeenCalled();
    const [, options] = uploadQueueService.executeDirectUpload.mock.calls[0]!;
    expect(options?.parts == null || options?.parts?.length === 0).toBe(true);
  });

  // ── 4. processOne sets processError when processVideo rejects ───────────────

  it('sets status to processError when processVideo throws', async () => {
    const file = makeFile('video.mp4', 5 * 1024 * 1024, 'video/mp4');
    const task = makeTask({ clientId: 'task-client-1' });

    uploadQueueService.addFile.mockReturnValue(task);
    videoProcessingService.load.mockResolvedValue(undefined);
    videoProcessingService.processVideo.mockRejectedValue(new Error('encoder crashed'));

    (component as unknown as { queue: ReturnType<typeof signal> }).queue.set([
      {
        clientId: 'page-client-1',
        filename: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        status: 'probed',
        file,
      },
    ]);
    (component as unknown as { taskClientIdMap: Map<string, string> }).taskClientIdMap.set(
      'page-client-1',
      task.clientId,
    );

    await component.processOne('page-client-1');

    const item = (component as unknown as { queue: ReturnType<typeof signal> })
      .queue()
      .find((i: { clientId: string }) => i.clientId === 'page-client-1');
    expect(item?.status).toBe('processError');
    expect(item?.processErrorMessage).toContain('encoder crashed');
  });

  it('sets processError (not stuck in processing) when processVideo times out', async () => {
    const file = makeFile('video.mp4', 5 * 1024 * 1024, 'video/mp4');
    const task = makeTask({ clientId: 'task-client-1' });

    uploadQueueService.addFile.mockReturnValue(task);
    videoProcessingService.load.mockResolvedValue(undefined);
    videoProcessingService.processVideo.mockRejectedValue(
      new Error('ffmpeg timed out after 90s while processing "video.mp4"'),
    );

    (component as unknown as { queue: ReturnType<typeof signal> }).queue.set([
      {
        clientId: 'page-client-1',
        filename: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        status: 'probed',
        file,
      },
    ]);
    (component as unknown as { taskClientIdMap: Map<string, string> }).taskClientIdMap.set(
      'page-client-1',
      task.clientId,
    );

    await component.processOne('page-client-1');

    const item = (component as unknown as { queue: ReturnType<typeof signal> })
      .queue()
      .find((i: { clientId: string }) => i.clientId === 'page-client-1');
    expect(item?.status).toBe('processError');
    // Message should mention the timeout so the user knows what happened
    expect(item?.processErrorMessage).toMatch(/timed out/i);
  });

  it('sets processed → ready and triggers upload when preflight was already done', async () => {
    const file = makeFile('video.mp4', 5 * 1024 * 1024, 'video/mp4');
    const processedFile = makeFile('output.mp4', 4 * 1024 * 1024, 'video/mp4');
    const task = makeTask({ clientId: 'task-client-1' });

    uploadQueueService.addFile.mockReturnValue(task);
    uploadQueueService.executeDirectUpload.mockResolvedValue(task);
    videoProcessingService.load.mockResolvedValue(undefined);
    videoProcessingService.processVideo.mockResolvedValue({
      outputFile: processedFile,
      wasTranscoded: false, // fast path — already H.264
      outputSizeBytes: processedFile.size,
      probe: {
        durationSeconds: 10, width: 1280, height: 720,
        codec: 'h264', bitrate: null, requiresDownscale: false, targetMaxHeightPx: 720,
      },
    });

    const preflightResult = {
      canUpload: true as const,
      cloudName: 'demo',
      uploadFolder: 'v/u1',
      targetAccountId: 'acc1',
      targetAccountRole: 'primary' as const,
      targetSecondaryOrder: null,
    };

    (component as unknown as { queue: ReturnType<typeof signal> }).queue.set([
      {
        clientId: 'page-client-1',
        filename: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        status: 'probed',
        file,
        preflightResult,
      },
    ]);
    (component as unknown as { taskClientIdMap: Map<string, string> }).taskClientIdMap.set(
      'page-client-1',
      task.clientId,
    );

    await component.processOne('page-client-1');

    // executeDirectUpload must have been called with the processed file
    expect(uploadQueueService.executeDirectUpload).toHaveBeenCalledWith(
      task.clientId,
      expect.objectContaining({ processedFile }),
    );
  });

  // ── 5. Preflight still happens before processing starts ─────────────────────

  it('transitions through checking → ready before uploadOne is triggered', () => {
    const file = makeFile('photo.jpg', 100, 'image/jpeg');
    const task = makeTask({ clientId: 'task-client-1' });
    const statusHistory: string[] = [];

    uploadQueueService.addFile.mockReturnValue(task);
    uploadService.checkPreflight.mockReturnValue(
      of({
        canUpload: true as const,
        cloudName: 'demo',
        uploadFolder: 'v/u1',
        targetAccountId: 'acc1',
        targetAccountRole: 'primary' as const,
        targetSecondaryOrder: null,
      }),
    );

    // Spy on patchItem to record status transitions
    const patchSpy = jest.spyOn(
      component as unknown as { patchItem: (id: string, patch: Record<string, unknown>) => void },
      'patchItem',
    );
    patchSpy.mockImplementation((_id, patch) => {
      if (typeof patch['status'] === 'string') {
        statusHistory.push(patch['status'] as string);
      }
    });

    component.runPreflightOne(
      // We need a page-side clientId in the queue first
      (() => {
        const itemId = 'page-client-pf-1';
        (component as unknown as { queue: ReturnType<typeof signal> }).queue.set([
          {
            clientId: itemId,
            filename: file.name,
            sizeBytes: file.size,
            mimeType: file.type,
            status: 'selected',
            file,
          },
        ]);
        (component as unknown as { taskClientIdMap: Map<string, string> }).taskClientIdMap.set(
          itemId,
          task.clientId,
        );
        return itemId;
      })(),
    );

    // checking must come before ready
    const checkingIdx = statusHistory.indexOf('checking');
    const readyIdx = statusHistory.indexOf('ready');
    expect(checkingIdx).toBeGreaterThanOrEqual(0);
    expect(readyIdx).toBeGreaterThan(checkingIdx);
  });
});
