import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../../core/tokens/api-base-url.token';
import {
  DirectUploadApiService,
  DirectUploadApiInitRequest,
  DirectUploadApiSignPartRequest,
  DirectUploadApiCompleteRequest,
  DirectUploadApiAbortRequest,
} from './direct-upload-api.service';

const API_BASE = 'http://localhost:3000/api/v1';

describe('DirectUploadApiService', () => {
  let service: DirectUploadApiService;
  let httpMock: HttpTestingController;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        DirectUploadApiService,
        { provide: API_BASE_URL, useValue: API_BASE },
      ],
    });

    service = TestBed.inject(DirectUploadApiService);
    httpMock = TestBed.inject(HttpTestingController);

    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
  });

  afterEach(() => {
    httpMock.verify();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ── 1. initDirectUpload ────────────────────────────────────────────────────

  it('initDirectUpload hits POST /media/direct-upload/init', async () => {
    const request: DirectUploadApiInitRequest = {
      fileSizeBytes: 1024,
      mimeType: 'image/jpeg',
      filename: 'photo.jpg',
    };

    const promise = firstValueFrom(service.initDirectUpload(request));

    const req = httpMock.expectOne(`${API_BASE}/media/direct-upload/init`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({
      uploadId: 'upload-1',
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
      cloudName: 'demo',
      resourceType: 'image',
      apiKey: 'key-123',
      timestamp: 1700000000,
      signature: 'sig-abc',
      folder: 'vaultchat/user-1',
      publicId: 'upload-1__part_0',
    });

    const result = await promise;
    expect(result.uploadId).toBe('upload-1');
    expect(result.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    expect(result.cloudName).toBe('demo');
    expect(result.apiKey).toBe('key-123');
    expect(result.signature).toBe('sig-abc');
    expect(result.publicId).toBe('upload-1__part_0');
  });

  // ── 2. signPart ───────────────────────────────────────────────────────────

  it('signPart hits POST /media/direct-upload/sign-part', async () => {
    const request: DirectUploadApiSignPartRequest = {
      uploadId: 'upload-1',
      partIndex: 1,
    };

    const promise = firstValueFrom(service.signPart(request));

    const req = httpMock.expectOne(`${API_BASE}/media/direct-upload/sign-part`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
      cloudName: 'demo',
      resourceType: 'image',
      apiKey: 'key-123',
      timestamp: 1700000001,
      signature: 'sig-part1',
      folder: 'vaultchat/user-1',
      publicId: 'upload-1__part_1',
    });

    const result = await promise;
    expect(result.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    expect(result.signature).toBe('sig-part1');
    expect(result.publicId).toBe('upload-1__part_1');
  });

  // ── 3. completeDirectUpload ───────────────────────────────────────────────

  it('completeDirectUpload hits POST /media/direct-upload/complete', async () => {
    const request: DirectUploadApiCompleteRequest = {
      uploadId: 'upload-1',
      cloudinaryPublicId: 'vault/user-1/upload-1',
      finalSizeBytes: 1024,
      width: 800,
      height: 600,
    };

    const promise = firstValueFrom(service.completeDirectUpload(request));

    const req = httpMock.expectOne(`${API_BASE}/media/direct-upload/complete`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ id: 'media-1', url: 'https://res.cloudinary.com/demo/image/upload/upload-1' });

    const result = await promise;
    expect(result).toBeTruthy();
  });

  // ── 4. abortDirectUpload ─────────────────────────────────────────────────

  it('abortDirectUpload sends DELETE with body', async () => {
    const request: DirectUploadApiAbortRequest = { uploadId: 'upload-1' };

    const promise = firstValueFrom(service.abortDirectUpload(request));

    const req = httpMock.expectOne(`${API_BASE}/media/direct-upload/abort`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual(request);
    req.flush(null, { status: 204, statusText: 'No Content' });

    await promise; // should resolve without error
  });

  // ── 5. uploadPartToCloudinary ─────────────────────────────────────────────

  it('uploadPartToCloudinary POSTs FormData with all signed fields to uploadUrl', async () => {
    const uploadUrl = 'https://api.cloudinary.com/v1_1/demo/image/upload';
    const file = new Blob(['hello'], { type: 'image/jpeg' });

    fetchMock.mockResolvedValueOnce(
      makeResponse(200, {
        public_id: 'vault/user/upload-1__part_0',
        bytes: 5,
        secure_url: 'https://res.cloudinary.com/demo/image/upload/vault/user/upload-1__part_0',
        asset_id: 'a1',
        version: 1,
        signature: 'sig',
        resource_type: 'image',
        created_at: '2026-06-07T00:00:00.000Z',
        url: 'https://res.cloudinary.com/demo/image/upload/vault/user/upload-1__part_0',
        original_filename: 'part-0',
        done: true,
      }),
    );

    const result = await firstValueFrom(
      service.uploadPartToCloudinary({
        uploadUrl,
        apiKey: 'key-123',
        timestamp: 1700000000,
        signature: 'sig-abc',
        folder: 'vaultchat/user-1',
        publicId: 'upload-1__part_0',
        file,
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    // Must POST to the plain uploadUrl — no signed params in the URL.
    expect(calledUrl).toBe(uploadUrl);
    expect(calledUrl).not.toContain('signature=');
    expect(calledUrl).not.toContain('api_key=');
    expect(options.method).toBe('POST');

    // All signed params must be in the FormData body.
    expect(options.body).toBeInstanceOf(FormData);
    const form = options.body as FormData;
    expect(form.get('api_key')).toBe('key-123');
    expect(form.get('timestamp')).toBe('1700000000');
    expect(form.get('signature')).toBe('sig-abc');
    expect(form.get('folder')).toBe('vaultchat/user-1');
    expect(form.get('public_id')).toBe('upload-1__part_0');
    // The file field is the Blob (JSDOM may wrap it as File in FormData, so check size/type).
    const fileField = form.get('file') as Blob;
    expect(fileField).toBeTruthy();
    expect(fileField.size).toBe(file.size);
    expect(fileField.type).toBe(file.type);

    expect(result.public_id).toBe('vault/user/upload-1__part_0');
    expect(result.bytes).toBe(5);
    expect(result.secure_url).toBe('https://res.cloudinary.com/demo/image/upload/vault/user/upload-1__part_0');
  });

  it('uploadPartToCloudinary throws on Cloudinary 4xx response', async () => {
    const uploadUrl = 'https://api.cloudinary.com/v1_1/demo/image/upload';
    const file = new Blob(['hello'], { type: 'image/jpeg' });

    fetchMock.mockResolvedValueOnce(
      makeResponse(400, { error: { message: 'invalid signature' } }),
    );

    await expect(
      firstValueFrom(
        service.uploadPartToCloudinary({
          uploadUrl,
          apiKey: 'key-123',
          timestamp: 1700000000,
          signature: 'bad-sig',
          folder: 'vaultchat/user-1',
          publicId: 'upload-1__part_0',
          file,
        }),
      ),
    ).rejects.toThrow('invalid signature');

    // Should not retry on 4xx.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ── 6. retry helper — retries transient failure and stops after success ───

  it('uploadPartToCloudinary retries network failure and succeeds on second attempt', async () => {
    jest.useFakeTimers();

    const uploadUrl = 'https://api.cloudinary.com/v1_1/demo/image/upload';
    const file = new Blob(['hello'], { type: 'image/jpeg' });

    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        makeResponse(200, {
          public_id: 'vault/user/upload-1__part_0',
          bytes: 5,
          secure_url: 'https://res.cloudinary.com/demo/image/upload/vault/user/upload-1__part_0',
          asset_id: 'a1',
          version: 1,
          signature: 'sig',
          resource_type: 'image',
          created_at: '2026-06-07T00:00:00.000Z',
          url: 'https://res.cloudinary.com/demo/image/upload/vault/user/upload-1__part_0',
          done: true,
        }),
      );

    const uploadPromise = firstValueFrom(
      service.uploadPartToCloudinary({
        uploadUrl,
        apiKey: 'key-123',
        timestamp: 1700000000,
        signature: 'sig-abc',
        folder: 'vaultchat/user-1',
        publicId: 'upload-1__part_0',
        file,
      }),
    );

    // First attempt fails immediately, pending retry delay.
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance past the 2s retry delay.
    await jest.advanceTimersByTimeAsync(2001);
    const result = await uploadPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.public_id).toBe('vault/user/upload-1__part_0');
  });

  it('uploadPartToCloudinary retries 5xx responses with backoff', async () => {
    jest.useFakeTimers();

    const uploadUrl = 'https://api.cloudinary.com/v1_1/demo/image/upload';
    const file = new Blob(['hello'], { type: 'image/jpeg' });

    fetchMock
      .mockResolvedValueOnce(makeResponse(503, { error: { message: 'service unavailable' } }))
      .mockResolvedValueOnce(makeResponse(503, { error: { message: 'still down' } }))
      .mockResolvedValueOnce(
        makeResponse(200, {
          public_id: 'vault/user/upload-1__part_0',
          bytes: 5,
          secure_url: 'https://res.cloudinary.com/demo/image/upload/vault/user/upload-1__part_0',
          asset_id: 'a1',
          version: 1,
          signature: 'sig',
          resource_type: 'image',
          created_at: '2026-06-07T00:00:00.000Z',
          url: 'https://res.cloudinary.com/demo/image/upload/vault/user/upload-1__part_0',
          done: true,
        }),
      );

    const uploadArgs = {
      uploadUrl,
      apiKey: 'key-123',
      timestamp: 1700000000,
      signature: 'sig-abc',
      folder: 'vaultchat/user-1',
      publicId: 'upload-1__part_0',
      file,
    };

    const uploadPromise = firstValueFrom(service.uploadPartToCloudinary(uploadArgs));

    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2001);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(4001);
    const result = await uploadPromise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.public_id).toBe('vault/user/upload-1__part_0');
  });

  // ── 7. retry helper does NOT retry 4xx ────────────────────────────────────

  it('uploadPartToCloudinary does not retry 4xx errors', async () => {
    const uploadUrl = 'https://api.cloudinary.com/v1_1/demo/image/upload';
    const file = new Blob(['hello'], { type: 'image/jpeg' });

    fetchMock.mockResolvedValueOnce(makeResponse(401, { error: { message: 'unauthorized' } }));

    await expect(
      firstValueFrom(
        service.uploadPartToCloudinary({
          uploadUrl,
          apiKey: 'key-123',
          timestamp: 1700000000,
          signature: 'bad-sig',
          folder: 'vaultchat/user-1',
          publicId: 'upload-1__part_0',
          file,
        }),
      ),
    ).rejects.toThrow('unauthorized');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uploadPartToCloudinary exhausts all retries and throws on persistent 5xx', async () => {
    jest.useFakeTimers();

    const uploadUrl = 'https://api.cloudinary.com/v1_1/demo/image/upload';
    const file = new Blob(['hello'], { type: 'image/jpeg' });

    // 4 failures — one initial + 3 retries (all exhausted).
    fetchMock.mockResolvedValue(makeResponse(503, { error: { message: 'server error' } }));

    const uploadArgs = {
      uploadUrl,
      apiKey: 'key-123',
      timestamp: 1700000000,
      signature: 'sig-abc',
      folder: 'vaultchat/user-1',
      publicId: 'upload-1__part_0',
      file,
    };

    const uploadPromise = firstValueFrom(service.uploadPartToCloudinary(uploadArgs));
    // Attach rejection handler immediately to avoid unhandled rejection warning.
    uploadPromise.catch(() => undefined);

    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2001);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(4001);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await jest.advanceTimersByTimeAsync(8001);
    await flushPromises();

    await expect(uploadPromise).rejects.toThrow('server error');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
