import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Verifies Cloudinary credentials by calling the Cloudinary Admin API /ping
 * endpoint with HTTP Basic auth (apiKey:apiSecret).
 *
 * Throws {@link BadRequestException} on invalid credentials so callers
 * can surface a clean 400 response — no internal secret is included in
 * the error message or logs.
 */
@Injectable()
export class CloudinaryVerifierService {
  private readonly logger = new Logger(CloudinaryVerifierService.name);

  /**
   * Calls `GET https://api.cloudinary.com/v1_1/{cloudName}/ping` with the
   * supplied credentials.
   *
   * @throws {BadRequestException} if the credentials are rejected by Cloudinary
   *   or if the cloud name does not exist.
   * @throws {Error} on unexpected network / server errors (5xx), letting the
   *   global exception filter return a 500.
   */
  async verifyCredentials(credentials: CloudinaryCredentials): Promise<void> {
    const { cloudName, apiKey, apiSecret } = credentials;

    const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/ping`;

    try {
      await axios.get(url, {
        auth: { username: apiKey, password: apiSecret },
        // Keep the timeout short — this is an inline validation call.
        timeout: 8_000,
      });
    } catch (err) {
      const axiosErr = err as AxiosError;

      if (axiosErr.isAxiosError) {
        const status = axiosErr.response?.status;

        // 401 / 403 → bad credentials; 404 → cloud_name doesn't exist.
        if (status === 401 || status === 403) {
          this.logger.warn(
            `Cloudinary credential verification failed for cloud "${cloudName}" — invalid API key or secret.`,
          );
          throw new BadRequestException(
            'Invalid Cloudinary credentials. Check your API key and API secret.',
          );
        }

        if (status === 404) {
          this.logger.warn(
            `Cloudinary credential verification failed — cloud name "${cloudName}" not found.`,
          );
          throw new BadRequestException(
            `Cloudinary cloud name "${cloudName}" was not found. Check your cloud name.`,
          );
        }

        // Network error or unexpected HTTP status — let it bubble as a 500.
        this.logger.error(
          `Unexpected error verifying Cloudinary credentials for cloud "${cloudName}": ` +
            `status=${status ?? 'no response'} message=${axiosErr.message}`,
        );
        throw new Error(
          `Could not reach Cloudinary to verify credentials (${axiosErr.message}).`,
        );
      }

      // Non-Axios error — rethrow as-is.
      throw err;
    }
  }
}
