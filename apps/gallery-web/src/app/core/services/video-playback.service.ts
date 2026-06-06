import { Injectable } from '@angular/core';

import { cloudinaryHlsUrl } from '../models/media-item.model';

/**
 * Playback mode chosen for a given video item.
 *
 * - `direct`  — set `<video src>` to the Cloudinary MP4 URL directly.
 *               Works for single-part videos in all browsers.
 * - `hls-native` — set `<video src>` to the Cloudinary HLS (.m3u8) URL.
 *               Safari and iOS support HLS natively; no JS library needed.
 * - `hls-js`  — attach HLS.js to the video element.
 *               Used in Chrome/Firefox/Edge where native HLS is not available.
 */
export type VideoPlaybackMode = 'direct' | 'hls-native' | 'hls-js';

/** Result of attaching a player to a video element. */
export interface PlaybackAttachResult {
  mode: VideoPlaybackMode;
  /** True when HLS.js was loaded and attached successfully. */
  hlsJsAttached: boolean;
}

/**
 * Manages video playback decisions and HLS.js lifecycle for gallery-web.
 *
 * ── Decision logic ────────────────────────────────────────────────────────
 * 1. If the item has a Cloudinary HLS URL AND the browser supports native HLS
 *    (Safari / iOS) → use `hls-native` (zero JS overhead).
 * 2. If the item has a Cloudinary HLS URL AND the browser does NOT support
 *    native HLS → lazy-load HLS.js and attach it (`hls-js`).
 * 3. Otherwise → set the MP4 URL directly (`direct`).
 *
 * ── Lifecycle ─────────────────────────────────────────────────────────────
 * Call `attach(videoEl, url, mimeType)` to start playback.
 * Call `detach()` to destroy the HLS.js instance and free memory.
 * The service is `providedIn: 'root'` but each component that uses it should
 * call `detach()` in `ngOnDestroy` to avoid leaking the HLS.js instance.
 */
@Injectable({ providedIn: 'root' })
export class VideoPlaybackService {
  /**
   * The active HLS.js instance, if any.
   * Typed as `unknown` so the service compiles in Node/Jest environments
   * where hls.js resolves differently.
   */
  private hlsInstance: unknown = null;

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns true when the browser can play HLS natively (Safari / iOS).
   * Cached after the first call.
   */
  canPlayHlsNatively(): boolean {
    if (typeof document === 'undefined') return false;
    const video = document.createElement('video');
    return video.canPlayType('application/vnd.apple.mpegurl') !== '';
  }

  /**
   * Determines the best playback mode for a video item.
   *
   * @param url       The canonical Cloudinary delivery URL (MP4).
   * @param mimeType  The MIME type of the media item.
   */
  resolveMode(url: string, mimeType: string): VideoPlaybackMode {
    if (!mimeType.startsWith('video/')) return 'direct';

    const hlsUrl = cloudinaryHlsUrl(url);
    if (!hlsUrl) return 'direct';

    return this.canPlayHlsNatively() ? 'hls-native' : 'hls-js';
  }

  /**
   * Attaches the appropriate player to `videoEl` and starts playback.
   *
   * - For `direct` and `hls-native`: sets `videoEl.src` and calls `load()`.
   * - For `hls-js`: lazy-loads HLS.js, creates an instance, and attaches it.
   *
   * Any previously attached HLS.js instance is destroyed first.
   *
   * @param videoEl   The `<video>` element to attach to.
   * @param url       The canonical Cloudinary delivery URL (MP4).
   * @param mimeType  The MIME type of the media item.
   * @returns         A promise resolving to the attach result.
   */
  async attach(
    videoEl: HTMLVideoElement,
    url: string,
    mimeType: string,
  ): Promise<PlaybackAttachResult> {
    this.detach();

    const mode = this.resolveMode(url, mimeType);

    if (mode === 'direct') {
      videoEl.src = url;
      videoEl.load();
      return { mode, hlsJsAttached: false };
    }

    const hlsUrl = cloudinaryHlsUrl(url) ?? url;

    if (mode === 'hls-native') {
      videoEl.src = hlsUrl;
      videoEl.load();
      return { mode, hlsJsAttached: false };
    }

    // mode === 'hls-js'
    try {
      const hlsJsAttached = await this.attachHlsJs(videoEl, hlsUrl);
      return { mode, hlsJsAttached };
    } catch {
      // HLS.js failed to load or attach — fall back to direct MP4.
      videoEl.src = url;
      videoEl.load();
      return { mode: 'direct', hlsJsAttached: false };
    }
  }

  /**
   * Destroys the active HLS.js instance and releases its resources.
   * Safe to call when no instance is active.
   */
  detach(): void {
    if (this.hlsInstance) {
      (this.hlsInstance as { destroy(): void }).destroy();
      this.hlsInstance = null;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Lazy-loads HLS.js and attaches it to the video element.
   *
   * Uses a dynamic import so the ~300 KB HLS.js bundle is only fetched when
   * a non-Safari browser encounters an HLS video — not at app startup.
   *
   * The `new Function` indirect import pattern is used (same as the ffmpeg
   * loader) to prevent TypeScript from down-levelling the dynamic import to
   * `require()` in the CommonJS test environment.
   */
  private readonly importEsm = new Function('specifier', 'return import(specifier);') as (
    specifier: string,
  ) => Promise<{ default: unknown }>;

  private async attachHlsJs(videoEl: HTMLVideoElement, hlsUrl: string): Promise<boolean> {
    const hlsModule = await this.importEsm('hls.js');

    // hls.js exports its class as the default export.
    const HlsClass = hlsModule.default as {
      isSupported(): boolean;
      new (): {
        loadSource(url: string): void;
        attachMedia(el: HTMLVideoElement): void;
        destroy(): void;
        on(event: string, cb: (...args: unknown[]) => void): void;
      };
    };

    if (!HlsClass.isSupported()) {
      // HLS.js is not supported in this environment — caller will fall back.
      throw new Error('HLS.js is not supported in this browser.');
    }

    const hls = new HlsClass();
    hls.loadSource(hlsUrl);
    hls.attachMedia(videoEl);

    this.hlsInstance = hls;
    return true;
  }
}
