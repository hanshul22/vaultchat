import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { createHash } from 'crypto';

import { CloudinaryCredentials } from './cloudinary-verifier.service';

/** Cloudinary resource buckets we route to based on the validated MIME type. */
export type CloudinaryResourceType = 'image' | 'video';

export interface CloudinaryUploadOptions {
  /** Resource bucket — derived from the validated MIME family. */
  resourceType: CloudinaryResourceType;
  /** Optional Cloudinary folder (e.g. a per-user or per-space namespace). */
  folder?: string;
}

/**
 * Normalised result of a successful Cloudinary upload. Only the fields the
 * media metadata row needs are surfaced; the raw response is never leaked.
 */
export interface CloudinaryUploadResult {
  publicId: string;
  url: string;
  bytes: number;
  width: number | null;
  height: number | null;
  /** Seconds (video only); null for images. */
  durationSeconds: number | null;
  resourceType: string;
}

export interface CloudinarySignedParams {
  signature: string;
  timestamp: number;
}

export interface CloudinaryUsageResult {
  storageUsedBytes: string;
}

/**
 * Performs signed uploads and destroys against a user's own Cloudinary account.
 *
 * Uses the same axios-based, SDK-free approach as {@link CloudinaryVerifierService}
 * so we don't pull in the Cloudinary Node SDK. Signing follows Cloudinary's
 * scheme: SHA-1 of the alphabetically-sorted params to sign, with the
 * api_secret appended, hex-encoded.
 *
 * SECURITY: the api_secret is used only to compute the signature and is never
 * logged or returned. Callers pass already-decrypted credentials.
 */
@Injectable()
export class CloudinaryUploaderService {
  private readonly logger = new Logger(CloudinaryUploaderService.name);

  /**
   * Uploads a buffer to Cloudinary using a signed request.
   *
   * @throws on any non-2xx response or network error so the caller can roll
   *   back the storage reservation (StorageModel.md §9).
   */
  async upload(
    credentials: CloudinaryCredentials,
    file: Buffer,
    options: CloudinaryUploadOptions,
  ): Promise<CloudinaryUploadResult> {
    const { cloudName, apiKey, apiSecret } = credentials;
    const timestamp = Math.floor(Date.now() / 1000);

    // Params that participate in the signature (alphabetical order).
    const signParams: Record<string, string | number> = { timestamp };
    if (options.folder) signParams['folder'] = options.folder;

    const { signature } = this.signParams(signParams, apiSecret, timestamp);

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file)]));
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    if (options.folder) form.append('folder', options.folder);

    const url =
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}` +
      `/${options.resourceType}/upload`;

    try {
      const { data } = await axios.post(url, form, {
        // Generous timeout: a 100 MB video can take a while on a slow uplink.
        timeout: 120_000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      return {
        publicId: data.public_id,
        url: data.secure_url ?? data.url,
        bytes: Number(data.bytes),
        width: data.width != null ? Number(data.width) : null,
        height: data.height != null ? Number(data.height) : null,
        durationSeconds: data.duration != null ? Number(data.duration) : null,
        resourceType: data.resource_type ?? options.resourceType,
      };
    } catch (err) {
      this.logFailure('upload', cloudName, err);
      throw new Error(`Cloudinary upload failed for cloud "${cloudName}".`);
    }
  }

  /**
   * Destroys a previously uploaded asset by its public_id.
   *
   * Returns true when Cloudinary confirms deletion ("ok") or reports the asset
   * was already gone ("not found"), so a retry that races a prior success is
   * still treated as success. Throws on transport / auth errors so the caller
   * can decide whether to queue a retry (PRD §6.3).
   */
  async destroy(
    credentials: CloudinaryCredentials,
    publicId: string,
    resourceType: CloudinaryResourceType,
  ): Promise<boolean> {
    const { cloudName, apiKey, apiSecret } = credentials;
    const timestamp = Math.floor(Date.now() / 1000);

    const { signature } = this.signParams({ public_id: publicId, timestamp }, apiSecret, timestamp);

    const form = new FormData();
    form.append('public_id', publicId);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);

    const url =
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}` +
      `/${resourceType}/destroy`;

    try {
      const { data } = await axios.post(url, form, { timeout: 30_000 });
      const result = String(data.result ?? '');
      return result === 'ok' || result === 'not found';
    } catch (err) {
      this.logFailure('destroy', cloudName, err);
      throw new Error(`Cloudinary destroy failed for cloud "${cloudName}".`);
    }
  }

  async fetchUsage(credentials: CloudinaryCredentials): Promise<CloudinaryUsageResult> {
    const { cloudName, apiKey, apiSecret } = credentials;
    const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/usage`;

    try {
      const { data } = await axios.get(url, {
        auth: { username: apiKey, password: apiSecret },
        timeout: 15_000,
      });

      const storageUsedBytes = this.extractUsageBytes(data);
      return { storageUsedBytes: storageUsedBytes.toString() };
    } catch (err) {
      this.logFailure('usage', cloudName, err);
      throw new Error(`Cloudinary usage fetch failed for cloud "${cloudName}".`);
    }
  }

  signUploadParams(
    credentials: CloudinaryCredentials,
    params: Record<string, string | number>,
    timestamp = Math.floor(Date.now() / 1000),
  ): CloudinarySignedParams {
    return this.signParams(params, credentials.apiSecret, timestamp);
  }

  buildDeliveryUrl(
    cloudName: string,
    resourceType: CloudinaryResourceType,
    publicId: string,
  ): string {
    const encodedPublicId = publicId
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/${resourceType}/upload/${encodedPublicId}`;
  }

  /**
   * Cloudinary signature: sort the params to sign by key, join as
   * `k=v&k=v`, append the api_secret, then SHA-1 hex.
   */
  private signParams(
    params: Record<string, string | number>,
    apiSecret: string,
    timestamp: number,
  ): CloudinarySignedParams {
    const toSign = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');

    return {
      signature: createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex'),
      timestamp,
    };
  }

  private extractUsageBytes(payload: unknown): bigint {
    const data = payload as Record<string, unknown> | null;
    const candidates = [
      (data?.['storage'] as Record<string, unknown> | undefined)?.['usage'],
      (data?.['usage'] as Record<string, unknown> | undefined)?.['storage'],
      (data?.['storage'] as Record<string, unknown> | undefined)?.['used_bytes'],
      data?.['storage_usage'],
    ];

    for (const candidate of candidates) {
      const parsed = this.toBigInt(candidate);
      if (parsed !== null) {
        return parsed >= 0n ? parsed : 0n;
      }
    }

    throw new Error('Cloudinary usage response did not include storage usage bytes.');
  }

  private toBigInt(value: unknown): bigint | null {
    if (typeof value === 'bigint') {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return BigInt(Math.trunc(value));
    }

    if (typeof value === 'string' && /^-?\d+$/.test(value)) {
      return BigInt(value);
    }

    return null;
  }

  /** Logs a failure without ever including credentials or the secret. */
  private logFailure(op: string, cloudName: string, err: unknown): void {
    const axiosErr = err as AxiosError;
    const status = axiosErr?.response?.status;
    this.logger.error(
      `Cloudinary ${op} error for cloud "${cloudName}": ` +
        `status=${status ?? 'no response'} message=${axiosErr?.message ?? String(err)}`,
    );
  }
}