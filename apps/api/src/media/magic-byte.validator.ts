import { Injectable } from '@nestjs/common';

/** Subset of the `file-type` result we consume. */
export interface DetectedFileType {
  ext: string;
  mime: string;
}

/**
 * Wraps `file-type` magic-byte detection behind an injectable so it can be
 * mocked in tests and so the ESM-only dependency is loaded through a single,
 * controlled seam.
 *
 * `file-type` v21 ships as pure ESM (`"type": "module"`). Because the API is
 * transpiled to CommonJS, a plain `import('file-type')` would be down-levelled
 * by TypeScript into `require('file-type')`, which throws ERR_REQUIRE_ESM. We
 * defeat that down-levelling with an indirect dynamic import built via the
 * Function constructor, so a genuine ESM `import()` survives to runtime.
 */
@Injectable()
export class MagicByteValidator {
  // Preserves a true dynamic import past TypeScript's CommonJS transform.
  private readonly importEsm = new Function('specifier', 'return import(specifier);') as (
    specifier: string,
  ) => Promise<typeof import('file-type')>;

  /**
   * Inspects the leading bytes of `buffer` and returns the detected type, or
   * null when the content does not match any known signature.
   */
  async detect(buffer: Buffer): Promise<DetectedFileType | null> {
    const { fileTypeFromBuffer } = await this.importEsm('file-type');
    const result = await fileTypeFromBuffer(new Uint8Array(buffer));
    return result ? { ext: result.ext, mime: result.mime } : null;
  }
}
