import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { MediaUploadResponse } from '../../core/models/media-upload-response.model';
import {
  DirectUploadPreflightSuccessResponse,
} from './index';
import { UploadQueueService } from './upload-queue.service';
import {
  DirectUploadApiService,
  DirectUploadInitResult,
  DirectUploadPartResult,
  DirectUploadSignPartResult,
} from './direct-upload-api.service';import { UploadTaskPartInput } from './upload-task.model';
import { UploadsApiService } from './uploads-api.service';

describe('UploadQueueService', () => {
  let service: UploadQueueService;
  let uploadsApi: jest.Mocked<UploadsApiService>;
  let directUploadApi: jest.Mocked<DirectUploadApiService>;

  beforeEach(() => {
    uploadsApi = {
      uploadPreflight: jest.fn(),
      directUploadInit: jest.fn(),
      directUploadSignPart: jest.fn(),
      directUploadComplete: jest.fn(),
      directUploadAbort: jest.fn(),
    } as unknown as jest.Mocked<UploadsApiService>;

    directUploadApi = {
      initDirectUpload: jest.fn(),
      signPart: jest.fn(),
      completeDirectUpload: jest.fn(),
      abortDirectUpload: jest.fn(),
      uploadPartToCloudinary: jest.fn(),
      withCloudinaryRetry: jest.fn(),
    } as unknown as jest.Mocked<DirectUploadApiService>;

    TestBed.configureTestingModule({
      providers: [
        UploadQueueService,
        { provide: UploadsApiService, useValue: uploadsApi },
        { provide: DirectUploadApiService, useValue: directUploadApi },
      ],
    });

    service = TestBed.inject(UploadQueueService);

    // Default happy-path stubs.
    uploadsApi.uploadPreflight.mockReturnValue(of(makePreflightSuccess()));
    directUploadApi.initDirectUpload.mockReturnValue(of(makeInitResult()));
    directUploadApi.signPart.mockImplementation((request) =>
      of(makeSignPartResult(request.partIndex)),
    );    directUploadApi.completeDirectUpload.mockReturnValue(of(makeMediaResponse()));
    directUploadApi.abortDirectUpload.mockReturnValue(of(undefined));
    directUploadApi.uploadPartToCloudinary.mockImplementation(({ publicId }) => {
      // Extract the part index from the publicId pattern for easy tracking.
      const match = publicId.match(/__part_(\d+)$/);
      const partIndex = match ? parseInt(match[1], 10) : 0;
      return of(makePartResult(partIndex, 7));
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('runs preflight before session init', async () => {
    const task = service.addFile(makeFile('original.jpg', 7));
    const order: string[] = [];

    uploadsApi.uploadPreflight.mockImplementation((request) => {
      order.push(`preflight:${request.fileSizeBytes}`);
      return of(makePreflightSuccess());
    });
    directUploadApi.initDirectUpload.mockImplementation(() => {
      order.push('init');
      return of(makeInitResult());
    });
    directUploadApi.uploadPartToCloudinary.mockImplementation(() => {
      order.push('upload-0');
      return of(makePartResult(0, 7));
    });
    directUploadApi.completeDirectUpload.mockImplementation(() => {
      order.push('complete');
      return of(makeMediaResponse());
    });

    await service.executeDirectUpload(task.clientId);

    expect(order).toEqual(['preflight:7', 'init', 'upload-0', 'complete']);
  });

  it('uses the signed fields from init for part 0', async () => {
    const task = service.addFile(makeFile('original.jpg', 7));
    const parts = makePartInputs([4, 5]);
    const init = makeInitResult('upload-abc');

    directUploadApi.initDirectUpload.mockReturnValue(of(init));
    directUploadApi.uploadPartToCloudinary
      .mockReturnValueOnce(of(makePartResult(0, 4)))
      .mockReturnValueOnce(of(makePartResult(1, 5)));
    directUploadApi.signPart.mockReturnValueOnce(of(makeSignPartResult(1)));

    await service.executeDirectUpload(task.clientId, { parts });

    // Part 0 must use the uploadUrl and signed fields from init — not a signedUrl.
    const partZeroCall = directUploadApi.uploadPartToCloudinary.mock.calls[0]?.[0];
    expect(partZeroCall?.uploadUrl).toBe(init.uploadUrl);
    expect(partZeroCall?.apiKey).toBe(init.apiKey);
    expect(partZeroCall?.signature).toBe(init.signature);
    expect(partZeroCall?.publicId).toBe(init.publicId);
    expect(partZeroCall?.folder).toBe(init.folder);
  });

  it('requests later part signatures one by one and preserves sequential upload order', async () => {
    const task = service.addFile(makeFile('original.jpg', 9));
    const parts = makePartInputs([3, 3, 3]);
    const order: string[] = [];

    uploadsApi.uploadPreflight.mockImplementation(() => {
      order.push('preflight');
      return of(makePreflightSuccess());
    });
    directUploadApi.initDirectUpload.mockImplementation(() => {
      order.push('init');
      return of(makeInitResult());
    });
    directUploadApi.signPart.mockImplementation((request) => {
      order.push(`sign-${request.partIndex}`);
      return of(makeSignPartResult(request.partIndex));
    });
    directUploadApi.uploadPartToCloudinary.mockImplementation(({ publicId }) => {
      // Extract part index from the public_id pattern: <uploadId>__part_<N>
      const match = publicId.match(/__part_(\d+)$/);
      const idx = match ? parseInt(match[1], 10) : 0;
      order.push(`upload-${idx}`);
      return of(makePartResult(idx, 3));
    });
    directUploadApi.completeDirectUpload.mockImplementation(() => {
      order.push('complete');
      return of(makeMediaResponse());
    });

    await service.executeDirectUpload(task.clientId, { parts });

    expect(directUploadApi.signPart).toHaveBeenCalledTimes(2);
    expect(directUploadApi.signPart.mock.calls.map(([r]) => r.partIndex)).toEqual([1, 2]);
    expect(order).toEqual([
      'preflight',
      'init',
      'upload-0',
      'sign-1',
      'upload-1',
      'sign-2',
      'upload-2',
      'complete',
    ]);
  });

  it('uses uploadId from init in all signPart calls', async () => {
    const task = service.addFile(makeFile('original.jpg', 6));
    const parts = makePartInputs([3, 3]);
    const init = makeInitResult('session-xyz');

    directUploadApi.initDirectUpload.mockReturnValue(of(init));
    directUploadApi.uploadPartToCloudinary.mockReturnValue(of(makePartResult(0, 3)));
    directUploadApi.signPart.mockReturnValue(of(makeSignPartResult(1)));

    await service.executeDirectUpload(task.clientId, { parts });

    expect(directUploadApi.signPart).toHaveBeenCalledWith({
      uploadId: 'session-xyz',
      partIndex: 1,
    });
  });

  it('calls completeDirectUpload with the public_id of the last uploaded part', async () => {
    const task = service.addFile(makeFile('original.jpg', 6));
    const parts = makePartInputs([3, 3]);

    directUploadApi.uploadPartToCloudinary
      .mockReturnValueOnce(of({ public_id: 'vault/user/part-0', bytes: 3 }))
      .mockReturnValueOnce(of({ public_id: 'vault/user/part-1', bytes: 3 }));
    directUploadApi.signPart.mockReturnValue(of(makeSignPartResult(1)));

    await service.executeDirectUpload(task.clientId, { parts });

    expect(directUploadApi.completeDirectUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        cloudinaryPublicId: 'vault/user/part-1',
        finalSizeBytes: 6,
      }),
    );
  });

  it('calls completeDirectUpload with uploadId from init', async () => {
    const task = service.addFile(makeFile('original.jpg', 7));
    const init = makeInitResult('session-complete-test');
    directUploadApi.initDirectUpload.mockReturnValue(of(init));

    await service.executeDirectUpload(task.clientId);

    expect(directUploadApi.completeDirectUpload).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId: 'session-complete-test' }),
    );
  });

  it('marks task as completed and stores completedMedia', async () => {
    const task = service.addFile(makeFile('original.jpg', 7));
    const media = makeMediaResponse('media-done');
    directUploadApi.completeDirectUpload.mockReturnValue(of(media));

    await service.executeDirectUpload(task.clientId);

    const done = service.getTask(task.clientId);
    expect(done?.state.phase).toBe('completed');
    expect(done?.completedMedia).toEqual(media);
  });

  it('fails immediately on uploadPartToCloudinary 4xx and aborts session', async () => {
    const task = service.addFile(makeFile('original.jpg', 9));
    const parts = makePartInputs([4, 5]);
    const init = makeInitResult('abort-test-session');

    directUploadApi.initDirectUpload.mockReturnValue(of(init));
    directUploadApi.uploadPartToCloudinary
      .mockReturnValueOnce(of({ public_id: 'vault/user/part-0', bytes: 4 }))
      .mockReturnValueOnce(throwError(() => new Error('bad signature')));

    await expect(service.executeDirectUpload(task.clientId, { parts })).rejects.toThrow('bad signature');

    expect(directUploadApi.abortDirectUpload).toHaveBeenCalledWith({
      uploadId: 'abort-test-session',
    });
    expect(service.getTask(task.clientId)?.state.phase).toBe('failed');
    expect(service.getTask(task.clientId)?.state.errorMessage).toBe('bad signature');
  });

  it('aborts with uploadId on init error', async () => {
    const task = service.addFile(makeFile('original.jpg', 7));
    const init = makeInitResult('abort-init-session');
    directUploadApi.initDirectUpload.mockReturnValue(of(init));
    directUploadApi.uploadPartToCloudinary.mockReturnValue(
      throwError(() => new Error('upload failed')),
    );

    await expect(service.executeDirectUpload(task.clientId)).rejects.toThrow('upload failed');

    expect(directUploadApi.abortDirectUpload).toHaveBeenCalledWith({
      uploadId: 'abort-init-session',
    });
  });

  it('does not call abort if init never succeeded', async () => {
    const task = service.addFile(makeFile('original.jpg', 7));
    directUploadApi.initDirectUpload.mockReturnValue(
      throwError(() => new Error('init failed')),
    );

    await expect(service.executeDirectUpload(task.clientId)).rejects.toThrow('init failed');

    expect(directUploadApi.abortDirectUpload).not.toHaveBeenCalled();
  });

  it('does not upload when preflight fails', async () => {
    const task = service.addFile(makeFile('original.jpg', 7));
    uploadsApi.uploadPreflight.mockReturnValue(
      of({ canUpload: false, reason: 'VAULT_FULL' as const }),
    );

    const result = await service.executeDirectUpload(task.clientId);

    expect(directUploadApi.initDirectUpload).not.toHaveBeenCalled();
    expect(directUploadApi.uploadPartToCloudinary).not.toHaveBeenCalled();
    expect(result.state.phase).toBe('failed');
  });

  it('sends every uploaded part in completion payload', async () => {
    const task = service.addFile(makeFile('original.jpg', 9));
    const parts = makePartInputs([2, 3, 4]);

    directUploadApi.uploadPartToCloudinary
      .mockReturnValueOnce(of({ public_id: 'media-part-0', bytes: 2 }))
      .mockReturnValueOnce(of({ public_id: 'media-part-1', bytes: 3 }))
      .mockReturnValueOnce(of({ public_id: 'media-part-2', bytes: 4 }));
    directUploadApi.signPart
      .mockReturnValueOnce(of(makeSignPartResult(1)))
      .mockReturnValueOnce(of(makeSignPartResult(2)));

    await service.executeDirectUpload(task.clientId, { parts });

    expect(directUploadApi.completeDirectUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        cloudinaryPublicId: 'media-part-2',
        finalSizeBytes: 9,
      }),
    );
    expect(service.getTask(task.clientId)?.state.phase).toBe('completed');
  });

  it('uses processedFile size as compressedTotalBytes when provided', async () => {
    const task = service.addFile(makeFile('original.mp4', 20));
    const processedFile = makeFile('processed.mp4', 12);

    await service.executeDirectUpload(task.clientId, { processedFile });

    expect(directUploadApi.completeDirectUpload).toHaveBeenCalledWith(
      expect.objectContaining({ finalSizeBytes: 12 }),
    );
  });
});

// ── Factories ─────────────────────────────────────────────────────────────────

function makePreflightSuccess(): DirectUploadPreflightSuccessResponse {
  return {
    canUpload: true,
    cloudName: 'demo-cloud',
    uploadFolder: 'vaultchat/user-1',
    targetAccountId: 'primary-account',
    targetAccountRole: 'primary',
    targetSecondaryOrder: null,
  };
}

function makeInitResult(
  uploadId = 'upload-test',
  uploadUrl = 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload',
): DirectUploadInitResult {
  return {
    uploadId,
    uploadUrl,
    cloudName: 'demo-cloud',
    resourceType: 'image',
    apiKey: 'key-demo',
    timestamp: 1700000000,
    signature: 'sig-part-0',
    folder: 'vaultchat/user-1',
    publicId: `${uploadId}__part_0`,
  };
}

function makeSignPartResult(partIndex: number): DirectUploadSignPartResult {
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/demo-cloud/image/upload`,
    cloudName: 'demo-cloud',
    resourceType: 'image',
    apiKey: 'key-demo',
    timestamp: 1700000000 + partIndex,
    signature: `sig-part-${partIndex}`,
    folder: 'vaultchat/user-1',
    publicId: `upload-test__part_${partIndex}`,
  };
}

function makePartResult(partIndex: number, bytes: number): DirectUploadPartResult {
  return {
    public_id: `vault/user/part-${partIndex}`,
    bytes,
    secure_url: `https://res.cloudinary.com/demo-cloud/image/upload/vault/user/part-${partIndex}`,
  };
}

function makeMediaResponse(mediaId = 'media-1'): MediaUploadResponse {
  return {
    id: mediaId,
    ownerId: 'user-1',
    storageSpaceId: null,
    cloudinaryPublicId: `vault/user/part-0`,
    url: `https://res.cloudinary.com/demo-cloud/image/upload/vault/user/part-0`,
    mimeType: 'image/jpeg',
    sizeBytes: '9',
    width: 100,
    height: 100,
    durationSeconds: null,
    createdAt: '2026-06-07T00:00:00.000Z',
  };
}

function makePartInputs(sizes: number[]): UploadTaskPartInput[] {
  const totalParts = sizes.length;
  return sizes.map((size, partIndex) => ({
    file: makeFile(`part-${partIndex}.bin`, size),
    partIndex,
    totalParts,
    sizeBytes: size,
  }));
}

function makeFile(name: string, size: number, type = 'image/jpeg'): File {
  return new File([new Uint8Array(size)], name, { type });
}
