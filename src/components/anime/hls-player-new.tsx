'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { proxify, proxifyM3u8, markPrimaryProxyRateLimited, isPrimaryProxyRateLimited, getFallbackProxyBase } from '@/lib/proxy';
import { validateSkipTime } from '@/lib/episode-metadata';
import {
  useSubtitleSettings,
  CustomSubtitleOverlay,
  SubtitleSettingsPanel,
  subtitleLangMatches,
} from './subtitle-settings';

interface HLSPlayerProps {
  url: string;
  animeId?: string;
  episodeNum?: number;
  animeTitle?: string;
  sourceType?: 'hls' | 'mp4';
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  allStreams?: Array<{ url: string; quality: string; label: string }>;
  subtitleTracks?: Array<{ url: string; lang: string; label: string }>;
  onEnded?: () => void;
  onProviderFailed?: () => void;
  onCanPlay?: () => void;
  autoplay?: boolean;
  autoSkip?: boolean;
  megaplayFileId?: string;
  megaplayAudio?: 'sub' | 'dub';
  /**
   * Optional callback fired with the underlying <video> element on mount
   * (and null on unmount). Lets parents (e.g., W2G room page) attach their
   * own play/pause/seek listeners for sync WITHOUT modifying the player UI.
   */
  onVideoElement?: (video: HTMLVideoElement | null) => void;
  /** Previous episode number (null if none). Powers the ◀ Prev button. */
  prevEp?: number | null;
  /** Next episode number (null if none). Powers the ▶ Next button. */
  nextEp?: number | null;
  /** Called when user clicks Prev Episode. Parent switches the stream. */
  onPrevEp?: () => void;
  /** Called when user clicks Next Episode. Parent switches the stream. */
  onNextEp?: () => void;
  /** Called when user toggles Theater Mode. Parent expands the player container. */
  onTheaterMode?: (active: boolean) => void;
  /** When true, the player fills its parent container (h-full w-full) instead
   *  of using aspect-ratio: 16/9. Used in theater mode so the video centers
   *  with black bars (object-contain) inside a wider container — like YouTube. */
  theaterMode?: boolean;
}

// ============================================================
// Glass Player — Animetsu-inspired glassmorphism design
// Features:
//   - Floating glass control bar (backdrop-blur, translucent)
//   - Animated progress bar with glow + gradient
//   - Smooth scale/translate animations on all interactions
//   - Glass menus for quality/subtitles/speed
//   - Animated center play button with pulse ring
//   - Double-tap to seek with ripple animation
//   - Keyboard shortcuts
// ============================================================

// ── Client-side Megaplay enc decryption (Web Crypto API) ──
const MEGAPLAY_AES_KEY_STR = "i?LMTAx0Q6,:}50U";
const MEGAPLAY_AES_IV_STR = "W0;27ToaUpl_P%'c";

// XOR token encoding (matches worker's decodePayload)
const XOR_KEY = "10b06cdc1ca48c9fb0b94af97cc040cf";
function encodeWorkerToken(url: string, referer: string): string {
  const combined = url + "\0" + (referer || "");
  const bytes = new TextEncoder().encode(combined);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ XOR_KEY.charCodeAt(i % XOR_KEY.length);
  }
  // base64url encode
  let binary = "";
  for (let i = 0; i < out.length; i++) binary += String.fromCharCode(out[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function decryptMegaplayEncClient(enc: string): Promise<string | null> {
  try {
    let b64 = enc.replace(/-/g, "+").replace(/_/g, "/");
    const rem = b64.length % 4;
    if (rem) b64 += "====".slice(rem);
    const data = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const keyRaw = new TextEncoder().encode(MEGAPLAY_AES_KEY_STR);
    const key = new Uint8Array(32);
    key.set(keyRaw.subarray(0, Math.min(16, keyRaw.length)));
    const iv = new TextEncoder().encode(MEGAPLAY_AES_IV_STR);
    const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-CBC" }, false, ["decrypt"]);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, data);
    const text = new TextDecoder().decode(decrypted);
    const json = JSON.parse(text);
    return json?.file || null;
  } catch (e) {
    console.error("[HLS] Megaplay enc decryption failed:", e);
    return null;
  }
}

export default function HLSPlayerNew({
  url, animeId, episodeNum, animeTitle, sourceType = 'hls',
  intro: introProp, outro: outroProp, allStreams, subtitleTracks, onEnded, onProviderFailed, onCanPlay, autoplay = true, autoSkip = false, megaplayFileId, megaplayAudio, onVideoElement,
  prevEp, nextEp, onPrevEp, onNextEp, onTheaterMode, theaterMode: theaterModeProp = false,
}: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Notify parent whenever the video element changes (mount/unmount).
  // We use a ref so onVideoElement stays out of the stream-loading effect deps.
  const onVideoElementRef = useRef(onVideoElement);
  onVideoElementRef.current = onVideoElement;
  useEffect(() => {
    onVideoElementRef.current?.(videoRef.current);
    return () => onVideoElementRef.current?.(null);
  }, []);

  // Defense-in-depth: validate skip times at the player level too.
  // Even if upstream code fails to filter bad data, this guarantees
  // the outro button never appears at the start of the video (which
  // happens when outro.start = 0 from a provider's "no data" sentinel).
  const intro = validateSkipTime(introProp ?? null, "intro");
  const outro = validateSkipTime(outroProp ?? null, "outro");

  // Keep the latest callbacks in refs so the stream-loading and video-event
  // effects DON'T list them as deps. Parents (e.g. watch-page-shell) re-render
  // on every `timeupdate` (several times/sec) and often pass inline arrow
  // callbacks — a new identity each render. If those were in the effect deps,
  // the stream effect would destroy + recreate the hls.js instance on every
  // frame, refetching the m3u8 + all segments in an infinite loop. Reading
  // through a ref keeps the effect stable (only url/sourceType/autoplay matter).
  const onProviderFailedRef = useRef(onProviderFailed);
  const onEndedRef = useRef(onEnded);
  const onCanPlayRef = useRef(onCanPlay);
  const onCanPlayFiredRef = useRef(false);
  const autoSkipRef = useRef(autoSkip);
  onProviderFailedRef.current = onProviderFailed;
  onEndedRef.current = onEnded;
  onCanPlayRef.current = onCanPlay;
  autoSkipRef.current = autoSkip;
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Theater Mode — like YouTube: player fills viewport width, page chrome
  // (sidebar, recommendations) is hidden, but NOT actual fullscreen.
  // Controlled by parent via onTheaterMode callback.
  const [theaterMode, setTheaterMode] = useState(false);
  // "Tap to unmute" overlay — shows when browser autoplay policy muted the video.
  // Without this, users think the sound is broken ("sound doesn't appear, have to
  // use the sound button to activate it"). The overlay makes it obvious.
  const [showUnmuteOverlay, setShowUnmuteOverlay] = useState(false);
  // small always-on-top window while user browses other tabs.
  // Volume boost — applies a GainNode to the audio, boosts beyond 100%.
  // Useful for quiet anime where max volume still isn't loud enough.
  // 0% = native (1x), 100% = ~2x boost. Stored per-session.
  const [volumeBoost, setVolumeBoost] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const isMobileRef = useRef(false);
  if (typeof window !== 'undefined') isMobileRef.current = 'ontouchstart' in window || window.innerWidth < 768;
  const [qualities, setQualities] = useState<any[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  // HLS audio tracks — read from hls.audioTracks on AUDIO_TRACKS_UPDATED event.
  // Most streams only have 1 (Japanese), but multi-audio streams (AniKoto,
  // AnimeSalt) have Japanese + English + Hindi etc.
  const [audioTracks, setAudioTracks] = useState<any[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(-1);
  const [activeMenu, setActiveMenu] = useState<'quality' | 'subtitles' | 'speed' | 'settings' | null>(null);
  // Settings submenu — which panel is open inside the settings menu.
  // null = root (shows the 6 categories with chevrons). Otherwise shows the
  // selected submenu's options + a back button.
  const [settingsSubmenu, setSettingsSubmenu] = useState<'volume_boost' | 'accessibility' | 'captions' | 'speed' | 'audio_track' | 'quality' | null>(null);
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const { settings: subtitleSettings, update: updateSubtitleSettings, reset: resetSubtitleSettings } = useSubtitleSettings();
  const [currentSubtitle, setCurrentSubtitle] = useState(-1);
  const currentSubtitleRef = useRef(currentSubtitle);
  currentSubtitleRef.current = currentSubtitle;
  const [hlsSubtitles, setHlsSubtitles] = useState<any[]>([]);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);
  // Track when user clicked skip — prevents the button from re-appearing
  // immediately after the click (the timeupdate loop would otherwise keep
  // showing it because video.currentTime is still in the skip range).
  const skipIntroClickedRef = useRef(0);
  const skipOutroClickedRef = useRef(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [seekRipple, setSeekRipple] = useState<{ x: number; dir: 'left' | 'right' } | null>(null);
  const [volumeHover, setVolumeHover] = useState(false);
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const [screenshotToast, setScreenshotToast] = useState<string | null>(null);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const [streamHealth, setStreamHealth] = useState<'good' | 'fair' | 'poor' | 'unknown'>('unknown');
  const [showStreamInfo, setShowStreamInfo] = useState(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Client-side megaplay resolution ──
  // When megaplayFileId is set, the browser calls megaplay.buzz/getSources
  // directly (browser IP not blocked), decrypts the enc field, and loads
  // the cdn.imgnex.top URL directly. Bypasses VPS IP block.
  const [resolvedUrl, setResolvedUrl] = useState<string>("");
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!megaplayFileId) {
      setResolvedUrl(url);
      return;
    }
    let cancelled = false;
    setResolving(true);
    setResolvedUrl("");
    (async () => {
      try {
        // Call /api/megaplay-sources (server-side) — this fetches
        // megaplay.buzz/getSources with the correct Referer, decrypts
        // the enc field, and returns { m3u8Url, tracks, intro, outro }.
        const res = await fetch(`/api/megaplay-sources?fileId=${megaplayFileId}`, {
          headers: { "Accept": "application/json" },
        });
        if (!res.ok) throw new Error(`getSources HTTP ${res.status}`);
        const data = await res.json();
        const rawM3u8 = data.m3u8Url;
        if (!rawM3u8) throw new Error("No m3u8 URL");

        // Wrap through CF Worker proxy (FAST — edge network).
        // The worker code has been updated to produce ABSOLUTE URLs
        // (https://luffytv-proxy.ggy892767.workers.dev/p/{token}) in m3u8.
        // You need to redeploy the worker with the updated luffytv-proxy.js
        // for this to work — the old worker produces relative URLs.
        const proxiedM3u8 = `https://luffytv-proxy.ggy892767.workers.dev/p/${encodeWorkerToken(rawM3u8, "https://megaplay.buzz/")}`;
        if (cancelled) return;
        setResolvedUrl(proxiedM3u8);
        setResolving(false);
      } catch (e) {
        if (cancelled) return;
        setResolvedUrl(url);
        setResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [megaplayFileId, megaplayAudio, url]);

  // ─── Load stream ──────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolvedUrl || resolving) return;

    setLoading(true);
    setError(null);
    retryCountRef.current = 0;
    setCurrentSubtitle(-1);
    currentSubtitleRef.current = -1; // CRITICAL: reset synchronously (state update is async)
    setHlsSubtitles([]);
    onCanPlayFiredRef.current = false; // reset for new stream
    userTurnedOffSubsRef.current = false; // reset "subs off" flag for new episode
    userSelectedSubRef.current = false; // reset manual selection flag for new episode

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (sourceType === 'mp4' || url.endsWith('.mp4') || url.includes('video.mp4')) {
      // Proxy the MP4 URL through the worker so the correct Referer is sent
      video.src = megaplayFileId ? resolvedUrl : proxify(resolvedUrl);
      video.load();
      if (autoplay) video.play().catch(() => {});
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        // ─── SMOOTH PLAYBACK TUNING (like anikura.club) ───
        // Previous config was optimized for "fast initial load" but caused
        // stuttering/lag during playback because:
        //   - maxBufferLength: 5 was too low (only 5s buffered → constant rebuffering)
        //   - lowLatencyMode: true is for LIVE streams, not VOD (causes aggressive ABR)
        //   - maxBufferHole: 0.5 was too tight (caused seeking issues)
        //
        // New config prioritizes SMOOTH playback over fast initial load:
        lowLatencyMode: false,           // VOD content — disable low latency mode
        backBufferLength: 30,            // 30s back buffer (was 20)
        maxBufferLength: 30,             // 30s ahead buffer (was 5 — 5s caused stuttering)
        maxMaxBufferLength: 120,         // 120s max buffer (was 60)
        maxBufferSize: 60 * 1000 * 1000, // 60MB max buffer size (was 50MB)
        maxBufferHole: 0.5,              // 0.5s hole tolerance
        // ─── QUALITY: start high, stay high ──────────────────
        startLevel: -1,                  // -1 = hls.js picks best level
        capLevelToPlayerSize: false,     // never cap quality based on player size
        abrEwmaDefaultEstimate: 5000000, // 5Mbps initial estimate (realistic, prevents overestimating)
        abrBandWidthFactor: 0.8,         // Standard ABR factor (was 0.95 — too aggressive)
        abrBandWidthUpFactor: 0.7,       // Standard upgrade factor (was 0.9)
        maxStarvationDelay: 2,           // 2s before quality drop (was 1 — too aggressive)
        abrEwmaDefaultEstimateMax: 10000000, // 10Mbps max estimate
        abrMaxWithRealBitrate: true,     // Use real bitrate from manifest
        // ─── TIMEOUTS — generous for proxy/CDN latency ───
        manifestLoadingTimeOut: 15000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 15000,
        levelLoadingMaxRetry: 3,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 4,          // 4 retries (was 3)
        fragLoadingRetryDelay: 500,      // 500ms delay (was 100ms — too fast)
        // ─── PREFETCH + PROGRESSIVE for smooth start ───
        startFragPrefetch: true,
        progressive: true,
        testBandwidth: false,            // Don't test bandwidth (causes quality drops)
        // ─── SUBTITLES ───
        enableWebVTT: true,
        xhrSetup: (xhr, url) => {
          xhr.withCredentials = false;
        },
        referrerPolicy: 'no-referrer',
      });
      hlsRef.current = hls;
      const m3u8Url = megaplayFileId ? resolvedUrl : proxifyM3u8(resolvedUrl);
      console.log(`[HLS] Loading: ${url.substring(0, 80)}... → proxied: ${m3u8Url.substring(0, 80)}...`);
      hls.loadSource(m3u8Url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setQualities(data.levels);
        setLoading(false);
        // Reset retry counter on successful manifest parse
        retryCountRef.current = 0;

        // ── Lock to highest quality level by default ──
        // User reported auto-blur — video quality was dropping mid-playback.
        // We force hls.currentLevel = highestLevelIdx to prevent ABR from
        // downscaling. User can still pick a lower quality from the menu
        // (changeQuality(-1) re-enables ABR if they want auto).
        if (data.levels.length > 0) {
          // Find the level with the highest resolution (height)
          let bestLevel = 0;
          let bestHeight = 0;
          for (let i = 0; i < data.levels.length; i++) {
            const h = data.levels[i].height || 0;
            if (h > bestHeight) {
              bestHeight = h;
              bestLevel = i;
            }
          }
          hls.currentLevel = bestLevel;
          setCurrentQuality(bestLevel);
          console.log(`[HLS] Locked to highest quality: ${bestHeight}p (level ${bestLevel})`);
        }

        if (autoplay) {
          // Try to play unmuted first. If the browser blocks it (autoplay
          // policy), mute + retry + show the "Tap to unmute" overlay.
          // The user can click anywhere on the video to unmute.
          video.play().catch(() => {
            video.muted = true;
            setMuted(true);
            setShowUnmuteOverlay(true);
            video.play().catch(() => {});
          });
        }
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_e, data) => {
        setHlsSubtitles(data.subtitleTracks || []);
        // If external subtitleTracks are available, DON'T auto-enable HLS-embedded
        // subs. The external tracks have working /api/stream URLs, while HLS-embedded
        // subtitle CDN URLs often 403 (blocked hosts). Let the external auto-enable
        // effect handle subtitle selection instead.
        if (subtitleTracks && subtitleTracks.length > 0) {
          if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
          return;
        }
        // ── Auto-select the user's preferred language subtitle track ──
        // (only when no external tracks are available)
        const preferredLang = subtitleSettings.defaultSubtitleLang || "en";
        if (preferredLang === "off") {
          // User explicitly wants no subtitles — disable all HLS subtitle tracks
          if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
          return;
        }
        // Don't override if the user has already manually selected a track
        if (userTurnedOffSubsRef.current) return;
        if (currentSubtitleRef.current >= 0) return;

        const tracks = data.subtitleTracks || [];
        const matchIdx = tracks.findIndex(t => subtitleLangMatches(t.lang, preferredLang));
        if (matchIdx >= 0 && hlsRef.current) {
          hlsRef.current.subtitleTrack = matchIdx;
          // Set the corresponding textTrack to 'hidden' so our overlay renders it
          setTimeout(() => {
            const video = videoRef.current;
            if (video) {
              for (let i = 0; i < video.textTracks.length; i++) {
                video.textTracks[i].mode = (i === matchIdx) ? 'hidden' : 'disabled';
              }
            }
            setCurrentSubtitle(matchIdx);
          }, 100);
        } else if (tracks.length > 0 && hlsRef.current) {
          // ── FALLBACK: no language match — auto-select the FIRST track ──
          // Inazuma (AniKoto) sometimes uses non-standard language codes that
          // don't match subtitleLangMatches(). Instead of leaving subs off
          // (which made users think subtitles were broken), select the first
          // available track. Most Inazuma streams have only 1 English sub
          // track anyway.
          hlsRef.current.subtitleTrack = 0;
          setTimeout(() => {
            const video = videoRef.current;
            if (video) {
              for (let i = 0; i < video.textTracks.length; i++) {
                video.textTracks[i].mode = (i === 0) ? 'hidden' : 'disabled';
              }
            }
            setCurrentSubtitle(0);
          }, 100);
        }
        // If no match found, leave HLS subs unselected — external subtitleTracks
        // (passed via prop) will be auto-enabled by the effect below.
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        setCurrentQuality(data.level);
        // After a level switch, HLS.js may re-enable native subtitle rendering.
        // Force the active track back to 'hidden' mode so only our overlay shows.
        if (currentSubtitleRef.current >= 0) {
          setTimeout(() => {
            const video = videoRef.current;
            if (video && video.textTracks.length > currentSubtitleRef.current) {
              video.textTracks[currentSubtitleRef.current].mode = 'hidden';
            }
          }, 100);
        }
      });

      // ── Audio tracks: read from manifest ──
      // Fires when hls.js parses the AUDIO groups in the master playlist.
      // Most anime streams only have 1 track (Japanese), but multi-audio
      // streams (AniKoto, AnimeSalt, Miruro) have Japanese + English + Hindi.
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_e, data) => {
        const tracks = data.audioTracks || [];
        setAudioTracks(tracks);
        if (tracks.length > 0) {
          // Default to the first track (usually Japanese)
          setCurrentAudioTrack(hls.audioTrack);
        }
      });
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_e, data) => {
        setCurrentAudioTrack(data.id);
      });

      hls.on(Hls.Events.ERROR, (_e, data) => {
        // Non-fatal errors are expected during streaming (a segment/playlist
        // fetch hiccup) and hls.js already recovers from them on its own —
        // console.warn so they don't trip Next's dev error overlay for
        // something that isn't actually broken.
        const log = data.fatal ? console.error : console.warn;
        log(`[HLS] Error: type=${data.type} details=${data.details} fatal=${data.fatal}`);

        // ── Detect 429 (rate limit) from the primary proxy worker ──
        // When Cloudflare worker hits its daily request limit, it returns 429.
        // hls.js reports this as a network error with response code 429.
        // We mark the primary as rate-limited and reload the stream through
        // the fallback worker.
        if (data.response && (data.response.code === 429 || data.response.code === 502)) {
          if (!isPrimaryProxyRateLimited()) {
            markPrimaryProxyRateLimited();
            // Reload the stream — buildProxyUrl will now use the fallback worker
            const video = videoRef.current;
            if (video && hlsRef.current) {
              const m3u8Url = megaplayFileId ? resolvedUrl : proxifyM3u8(resolvedUrl);
              console.log(`[HLS] Retrying through fallback worker: ${m3u8Url.substring(0, 80)}...`);
              hlsRef.current.loadSource(m3u8Url);
            }
            return; // don't trigger the fatal error handling below
          }
        }

        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // ── Infinite auto-retry — never gives up ──
            // The proxy can be flaky (CF Worker rate limits, CDN 403s, etc).
            // Keep retrying until it works. User never sees an error.
            // After 30 retries, do a full restart (destroy + recreate HLS).
            if (retryCountRef.current < 30) {
              retryCountRef.current++;
              const delay = Math.min(1000 * Math.pow(1.2, retryCountRef.current), 3000);
              console.warn(`[HLS] Fatal network error (retry ${retryCountRef.current}/30 in ${delay}ms): ${data.details}`);
              setTimeout(() => hls.startLoad(), delay);
            } else {
              // Full restart after 30 retries
              console.error(`[HLS] 30 retries done — full restart`);
              retryCountRef.current = 0;
              if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
              }
              // Force re-render to recreate HLS
              setRetryTrigger(prev => prev + 1);
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setError('Playback error. Try another server.');
            setLoading(false);
            onProviderFailedRef.current?.();
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari/iOS — native HLS
      video.src = megaplayFileId ? resolvedUrl : proxifyM3u8(resolvedUrl);
      const onNativeError = () => { setError('Stream failed to load.'); setLoading(false); };
      video.addEventListener('error', onNativeError);
      if (autoplay) video.play().catch(() => {});
      return () => {
        video.removeEventListener('error', onNativeError);
      };
    } else {
      setError('HLS not supported');
      setLoading(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url, sourceType, autoplay, resolvedUrl, resolving, retryTrigger]);

  // ─── Video events ─────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
      // Auto Skip — when enabled, jump straight past the opening/ending.
      if (autoSkipRef.current) {
        if (intro && video.currentTime >= intro.start && video.currentTime < intro.end - 0.3) {
          video.currentTime = intro.end;
          return;
        }
        if (outro && video.currentTime >= outro.start && video.currentTime < outro.end - 0.3) {
          video.currentTime = Math.min(outro.end, video.duration || outro.end);
          return;
        }
      }
      // Show skip intro button from 3s BEFORE intro starts until 5s AFTER it ends.
      // Also show immediately if video just loaded and we're already in the intro range
      // (happens when mimi loads super fast and starts playing at 0s, which is before intro.start)
      //
      // BUT: if the user just clicked Skip Intro (within last 8s), DON'T re-show the
      // button — otherwise it instantly pops back up because video.currentTime is still
      // in the intro range right after the seek.
      const sinceIntroClick = Date.now() - skipIntroClickedRef.current;
      const sinceOutroClick = Date.now() - skipOutroClickedRef.current;

      if (intro && video.currentTime >= (intro.start - 3) && video.currentTime < (intro.end + 5) && sinceIntroClick > 8000) {
        setShowSkipIntro(true);
      } else {
        setShowSkipIntro(false);
      }
      if (outro && video.currentTime >= (outro.start - 3) && video.currentTime < (outro.end + 10) && sinceOutroClick > 8000) {
        setShowSkipOutro(true);
      } else {
        setShowSkipOutro(false);
      }
    };

    // Also check on MANIFEST_PARSED / loadedmetadata — if intro data is available
    // and we're at position 0, show the skip button immediately (before timeupdate fires)
    const onLoadedMetadata = () => {
      setDuration(video.duration || 0);
      // If intro starts soon (within first 60s), show the button immediately
      if (intro && intro.start < 60 && video.currentTime < intro.end) {
        setShowSkipIntro(true);
      }
      if (outro && video.duration && outro.start < video.duration) {
        // Don't show outro yet, just confirm we have the data
      }
    };
    const onDur = () => setDuration(video.duration || 0);

    let waitingTimer: ReturnType<typeof setTimeout> | null = null;
    const onWaiting = () => {
      if (waitingTimer) clearTimeout(waitingTimer);
      // Show loading after 1.5s of waiting (was 5s — too long, user gets confused)
      waitingTimer = setTimeout(() => {
        if (video.readyState < 3) setLoading(true);
      }, 1500);
    };
    const onPlaying = () => {
      if (waitingTimer) { clearTimeout(waitingTimer); waitingTimer = null; }
      setLoading(false);
    };
    const onCanPlay = () => {
      if (waitingTimer) { clearTimeout(waitingTimer); waitingTimer = null; }
      setLoading(false);
      // Notify parent that video is ready to play (for loading screen dismissal)
      if (!onCanPlayFiredRef.current) {
        onCanPlayFiredRef.current = true;
        onCanPlayRef.current?.();
      }
    };
    const onEnd = () => onEndedRef.current?.();
    const onErr = () => { setError('Playback error.'); setLoading(false); };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('durationchange', onDur);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('ended', onEnd);
    video.addEventListener('error', onErr);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('durationchange', onDur);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('ended', onEnd);
      video.removeEventListener('error', onErr);
    };
  }, [intro, outro]);

  // ─── Controls auto-hide ───────────────────────────────────────────
  const CONTROLS_TIMEOUT = isMobileRef.current ? 4000 : 3500;
  const showControlsTemp = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (playing) { setShowControls(false); setActiveMenu(null); }
    }, CONTROLS_TIMEOUT);
  }, [playing, CONTROLS_TIMEOUT]);

  // ─── Auto-hide controls when video starts playing ─────────────────
  // On mobile, there's no mousemove to trigger showControlsTemp(),
  // so the controls stay visible forever. This effect starts the
  // auto-hide timer whenever playback begins.
  useEffect(() => {
    if (playing) {
      // Start the auto-hide timer — controls will disappear after CONTROLS_TIMEOUT
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setActiveMenu(null);
      }, CONTROLS_TIMEOUT);
    } else {
      // Paused — show controls and cancel any pending hide
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      setShowControls(true);
    }
  }, [playing, CONTROLS_TIMEOUT]);

  // ─── Fullscreen (cross-browser: standard + webkit for iOS Safari) ───
  const getFullscreenElement = () =>
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    null;

  const requestFullscreen = async (el: HTMLElement) => {
    if (el.requestFullscreen) return el.requestFullscreen();
    if ((el as any).webkitRequestFullscreen) return (el as any).webkitRequestFullscreen();
    // iOS Safari < 16.4: only <video> can go fullscreen
    if (videoRef.current && (videoRef.current as any).webkitEnterFullscreen) {
      return (videoRef.current as any).webkitEnterFullscreen();
    }
    throw new Error('Fullscreen not supported');
  };

  const exitFullscreen = async () => {
    if (document.exitFullscreen) return document.exitFullscreen();
    if ((document as any).webkitExitFullscreen) return (document as any).webkitExitFullscreen();
    // iOS video fullscreen
    if (videoRef.current && (videoRef.current as any).webkitExitFullscreen) {
      return (videoRef.current as any).webkitExitFullscreen();
    }
  };

  useEffect(() => {
    const onFs = () => setFullscreen(!!getFullscreenElement());
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (getFullscreenElement()) {
        await exitFullscreen();
        // Release orientation lock when exiting fullscreen
        try { await (screen.orientation as any)?.unlock(); } catch {}
      } else if (containerRef.current) {
        await requestFullscreen(containerRef.current);
        // On mobile, lock to landscape so the video fills the screen
        try {
          if (screen.orientation && typeof (screen.orientation as any).lock === 'function') {
            await (screen.orientation as any).lock('landscape');
          }
        } catch {
          // Orientation lock not supported or denied — fullscreen still works
        }
      }
    } catch {
      // Fullscreen request failed silently
    }
  };

  // ── Theater Mode ──
  // Like YouTube: parent expands the player to fill viewport width,
  // hides page chrome (sidebar, recommendations). NOT actual fullscreen
  // (no OS-level fullscreen, browser chrome still visible).
  const toggleTheaterMode = () => {
    const next = !theaterMode;
    setTheaterMode(next);
    onTheaterMode?.(next);
    showControlsTemp();
  };

  // ── Volume Boost ──
  // Applies a Web Audio API GainNode to the video element. Boosts the
  // audio beyond the native 100% max. 0% = native (1x), 100% = 2x boost.
  // We lazily create the AudioContext on first boost to avoid autoplay
  // restrictions (browser blocks audio context creation until user gesture).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const applyVolumeBoost = (boostPct: number) => {
    setVolumeBoost(boostPct);
    const video = videoRef.current;
    if (!video) return;
    try {
      if (boostPct === 0) {
        // Reset to native — disconnect gain node
        if (gainNodeRef.current) {
          gainNodeRef.current.gain.value = 1;
        }
        return;
      }
      // Lazily create AudioContext + GainNode on first boost
      if (!audioCtxRef.current) {
        const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return;
        const ctx: AudioContext = new Ctor();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaElementSource(video);
        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(ctx.destination);
        gainNodeRef.current = gain;
      }
      const ctx = audioCtxRef.current;
      if (ctx?.state === 'suspended') {
        ctx.resume();
      }
      // Map 0-100% → 1x to 2x gain
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = 1 + (boostPct / 100);
      }
    } catch (e) {
      // AudioContext failed (e.g. CORS-tainted media) — silent fail
      console.warn('[HLS] volume boost failed:', e);
    }
  };

  const seek = (time: number) => { if (videoRef.current) videoRef.current.currentTime = time; };
  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) v.play(); else v.pause();
  };
  const toggleMute = () => {
    const v = videoRef.current; if (!v) return;
    v.muted = !v.muted; setMuted(v.muted);
    // Hide the unmute overlay if the user just unmuted
    if (!v.muted) setShowUnmuteOverlay(false);
  };
  const changeVolume = (vol: number) => {
    const v = videoRef.current; if (!v) return;
    v.volume = vol; v.muted = vol === 0;
    setVolume(vol); setMuted(vol === 0);
  };
  const changeQuality = (level: number) => {
    if (hlsRef.current) { hlsRef.current.currentLevel = level; setCurrentQuality(level); }
    setActiveMenu(null);
  };

  // ── Switch HLS audio track ──
  // hls.audioTrack is the index into hls.audioTracks. Switching is instant —
  // no video restart, no buffer flush. The browser fetches the new audio
  // variant on the next segment boundary.
  const changeAudioTrack = (trackId: number) => {
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackId;
      setCurrentAudioTrack(trackId);
    }
    setActiveMenu(null);
  };

  // ── Auto-enable the first external subtitle track ──
  // The `default` attribute on <track> doesn't always work reliably across
  // browsers (especially when the track loads after the video starts). This
  // effect explicitly enables the first external subtitle track once the
  // video metadata has loaded AND there are no HLS-embedded subtitles.
  // This ensures subtitles show automatically when the user starts watching.
  // ── Track whether the user has explicitly turned subs off ──
  // Without this, the auto-enable effect below would re-enable subs
  // every time currentSubtitle changes (including when the user just
  // clicked "Off" → currentSubtitle becomes -1 → effect re-runs →
  // condition `currentSubtitle === -1` is true → re-enables subs).
  // This ref breaks that loop: once the user clicks Off, we stop
  // auto-enabling for the lifetime of this video instance.
  const userTurnedOffSubsRef = useRef(false);

  // Tracks whether the user has MANUALLY selected any subtitle track
  // (including switching between tracks, not just turning them off).
  // When true, the auto-enable effect skips entirely so the user's
  // choice is respected. Reset on URL change (new episode).
  const userSelectedSubRef = useRef(false);

  // ── Auto-enable the user's preferred external subtitle track ──
  // The `default` attribute on <track> doesn't always work reliably across
  // browsers (especially when the track loads after the video starts). This
  // effect explicitly enables the external subtitle track matching the user's
  // preferred language (configured in Subtitle Settings → Default subtitle).
  //
  // CRITICAL: When switching episodes (same anime, key=hls-${animeId}), the
  // player doesn't remount. The <track> elements update with new URLs, but
  // video.textTracks gets reset. We need to wait for the new tracks to load
  // before enabling them. We listen for BOTH 'loadstart' (fires when new
  // media source is set) AND 'loadedmetadata' (fires when metadata is ready).
  useEffect(() => {
    // If HLS has embedded subs, DON'T rely on them — always prefer external tracks
    // when available. The HLS-embedded subtitle CDN URLs often 403 (blocked hosts),
    // and the SUBTITLE_TRACKS_UPDATED handler sets currentSubtitle even when the
    // track fails to load. This causes subtitles to silently not appear.
    // External subtitleTracks (from the AniKoto API) have correct /api/stream URLs
    // that actually work. Skip HLS subs entirely when external tracks exist.
    if (hlsSubtitles.length > 0 && subtitleTracks && subtitleTracks.length > 0) {
      // External tracks available — disable HLS subs and use external instead
      if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
      // Don't return — fall through to external subtitle auto-enable below
    } else if (hlsSubtitles.length > 0) {
      return; // HLS subs only, no external tracks — let HLS handle it
    }
    if (!subtitleTracks || subtitleTracks.length === 0) return;
    const video = videoRef.current;
    if (!video) return;

    const preferredLang = subtitleSettings.defaultSubtitleLang || "en";
    if (preferredLang === "off") return; // user wants subs off by default

    // Reset the subtitle state for the new episode's tracks
    // (the stream-loading effect already does this, but this is a safety net)
    const enablePreferredSub = () => {
      // Don't override if the user explicitly turned subs off
      if (userTurnedOffSubsRef.current) return;
      // Don't override if the user has manually selected a track
      if (userSelectedSubRef.current) return;

      // video.textTracks includes BOTH HLS-embedded AND external <track> elements.
      // HLS tracks come FIRST (indices 0..N-1), external tracks come AFTER (N..M).
      // We need to offset the external track index by hlsSubtitles.length.
      if (video.textTracks.length === 0) {
        // Tracks not loaded yet — retry after a short delay
        setTimeout(enablePreferredSub, 500);
        return;
      }

      // Calculate offset: if HLS embedded subs exist, they occupy the first N slots
      const hlsOffset = hlsSubtitles.length;
      const totalTracks = video.textTracks.length;
      const externalCount = totalTracks - hlsOffset;

      if (externalCount <= 0) {
        // External <track> elements haven't loaded yet — retry
        setTimeout(enablePreferredSub, 500);
        return;
      }

      // ── Pick the preferred-language external subtitle track ──
      // Walk the external subtitleTracks prop array (the source of <track> elements)
      // and find one whose `lang` matches the user's preferred language (default "en").
      // Only fall back to the first track if NO preferred-language match exists.
      // This fixes the bug where Chinese (often track 0) was auto-selected instead
      // of English.
      const externalPropTracks = subtitleTracks || [];
      let externalIdx = externalPropTracks.findIndex(t =>
        subtitleLangMatches(t.lang, preferredLang)
      );
      if (externalIdx < 0) {
        // No preferred-language match — fall back to first track
        externalIdx = 0;
      }
      const trackIdx = hlsOffset + externalIdx;  // offset into video.textTracks

      // Disable ALL tracks first, then enable the preferred one
      for (let i = 0; i < totalTracks; i++) {
        video.textTracks[i].mode = (i === trackIdx) ? 'hidden' : 'disabled';
      }
      // Set currentSubtitle to the EXTERNAL track index (not the video.textTracks index)
      // This is the index into the subtitleTracks prop array + hlsSubtitles.length
      // for the CC menu to show the right selection
      setCurrentSubtitle(trackIdx);
      console.log(`[Subtitles] Auto-enabled external track ${externalIdx} (textTrack ${trackIdx}, hlsOffset ${hlsOffset}, total ${totalTracks}, lang=${externalPropTracks[externalIdx]?.lang || '?'})`);
    };

    // Try immediately, then on loadstart, then on loadedmetadata
    // (covers all timing scenarios — new episode load, remount, etc.)
    const timeoutId = setTimeout(enablePreferredSub, 200);
    const onLoadStart = () => {
      // New media source loaded — wait a bit for tracks to populate
      setTimeout(enablePreferredSub, 300);
    };
    const onLoadedMetadata = () => {
      enablePreferredSub();
    };
    video.addEventListener('loadstart', onLoadStart);
    video.addEventListener('loadedmetadata', onLoadedMetadata);

    return () => {
      clearTimeout(timeoutId);
      video.removeEventListener('loadstart', onLoadStart);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [hlsSubtitles.length, subtitleTracks, url]);

  // ── Watch beacon — send heartbeat every 30s while playing ──
  // Lets the admin panel see who's watching what in real-time.
  useEffect(() => {
    if (!animeTitle || !playing) return;
    const sendBeacon = () => {
      fetch("/api/analytics/watch-beacon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ animeTitle, episodeNum, animeId }),
        keepalive: true,
      }).catch(() => {});
    };
    sendBeacon(); // send immediately when playback starts
    const interval = setInterval(sendBeacon, 30000); // every 30s
    return () => clearInterval(interval);
  }, [animeTitle, episodeNum, animeId, playing]);

  // ── Force textTracks to 'hidden' mode (prevents double subtitles) ──
  // HLS.js periodically sets textTrack.mode back to 'showing' (native rendering),
  // which causes our CustomSubtitleOverlay + native ::cue to both render.
  // Listen to the 'change' event on TextTrackList for immediate reaction
  // instead of polling every 500ms (which caused visible flicker).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => {
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if (track.mode === 'showing') {
          track.mode = 'hidden';
        }
      }
    };
    video.textTracks.addEventListener('change', handler);
    return () => video.textTracks.removeEventListener('change', handler);
  }, []);

  const changeSubtitle = (track: number) => {
    if (track === -1) {
      // User clicked "Off" — remember this so the auto-enable effect
      // doesn't immediately re-enable subs (which would undo this).
      userTurnedOffSubsRef.current = true;
      userSelectedSubRef.current = true; // user has made a manual choice
      if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
      const video = videoRef.current;
      if (video) for (let i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = 'disabled';
      setCurrentSubtitle(-1);
    } else if (hlsRef.current && track < hlsSubtitles.length) {
      // User selected a specific track — clear the "turned off" flag
      userTurnedOffSubsRef.current = false;
      userSelectedSubRef.current = true; // user has manually switched — stop auto-enable
      // HLS-embedded subtitle track
      hlsRef.current.subtitleTrack = track;
      const video = videoRef.current;
      // Set the selected track to 'hidden' (cues fire, native rendering suppressed)
      // and disable all others. This prevents double subtitles.
      if (video) {
        setTimeout(() => {
          for (let i = 0; i < video.textTracks.length; i++) {
            video.textTracks[i].mode = (i === track) ? 'hidden' : 'disabled';
          }
        }, 100);
      }
      setCurrentSubtitle(track);
    } else {
      // External subtitle (<track> element) — clear the "turned off" flag
      userTurnedOffSubsRef.current = false;
      userSelectedSubRef.current = true; // user has manually switched — stop auto-enable
      if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
      const video = videoRef.current;
      if (video) for (let i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = (i === track) ? 'hidden' : 'disabled';
      setCurrentSubtitle(track);
    }
    setActiveMenu(null);
  };
  const changePlaybackRate = (rate: number) => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
    setActiveMenu(null);
  };
  const skipTime = (seconds: number) => { if (videoRef.current) videoRef.current.currentTime += seconds; };
  const skipIntro = () => {
    if (videoRef.current && intro) {
      videoRef.current.currentTime = intro.end;
      skipIntroClickedRef.current = Date.now();
      setShowSkipIntro(false);
    }
  };
  const skipOutro = () => {
    if (videoRef.current && outro) {
      videoRef.current.currentTime = outro.end;
      skipOutroClickedRef.current = Date.now();
      setShowSkipOutro(false);
    }
  };

  // ─── Screenshot: capture current video frame as PNG ───────────────
  const takeScreenshot = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setScreenshotToast('Video not ready');
      setTimeout(() => setScreenshotToast(null), 2000);
      return;
    }
    try {
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      // Download the screenshot
      const link = document.createElement('a');
      const filename = `screenshot-${animeId || 'anime'}-ep${episodeNum || 1}-${Math.floor(video.currentTime)}s.png`;
      link.download = filename;
      link.href = dataUrl;
      link.click();
      // Flash animation
      setScreenshotFlash(true);
      setTimeout(() => setScreenshotFlash(false), 300);
      setScreenshotToast('Screenshot saved!');
      setTimeout(() => setScreenshotToast(null), 2000);
    } catch (err) {
      // CORS-tainted canvas — can't capture directly
      setScreenshotToast('Screenshot blocked by CORS');
      setTimeout(() => setScreenshotToast(null), 3000);
    }
    showControlsTemp();
  }, [animeId, episodeNum, showControlsTemp]);

  // ─── Download: download the current stream URL ────────────────────
  const handleDownload = useCallback(async () => {
    setDownloadLoading(true);
    try {
      const video = videoRef.current;
      if (!video) throw new Error('No video');
      // For MP4 sources, download directly
      if (sourceType === 'mp4' || url.endsWith('.mp4')) {
        const link = document.createElement('a');
        link.href = proxify(url);
        link.download = `${animeId || 'anime'}-ep${episodeNum || 1}.mp4`;
        link.target = '_blank';
        link.click();
        setDownloadToast('Download started');
      } else {
        // For HLS streams, open the proxied m3u8 URL in new tab
        // (user can use a downloader like ffmpeg or browser extension)
        const link = document.createElement('a');
        link.href = proxifyM3u8(url);
        link.download = `${animeId || 'anime'}-ep${episodeNum || 1}.m3u8`;
        link.target = '_blank';
        link.click();
        setDownloadToast('Stream link opened — use a video downloader for HLS');
      }
      setTimeout(() => setDownloadToast(null), 3500);
    } catch (err) {
      setDownloadToast('Download failed');
      setTimeout(() => setDownloadToast(null), 2000);
    }
    setDownloadLoading(false);
    showControlsTemp();
  }, [url, sourceType, animeId, episodeNum, showControlsTemp]);

  // ─── Stream health monitor ────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let lastTime = video.currentTime;
    let lastDate = Date.now();
    let stallCount = 0;
    const interval = setInterval(() => {
      if (video.paused) return;
      const now = Date.now();
      const elapsed = (now - lastDate) / 1000;
      const delta = video.currentTime - lastTime;
      // If time advanced less than 80% of real time, it's stalling
      if (delta < elapsed * 0.8 && delta >= 0) {
        stallCount++;
      } else if (delta >= elapsed * 0.9) {
        stallCount = Math.max(0, stallCount - 1);
      }
      // Determine health
      if (stallCount >= 3) setStreamHealth('poor');
      else if (stallCount >= 1) setStreamHealth('fair');
      else setStreamHealth('good');
      lastTime = video.currentTime;
      lastDate = now;
    }, 2000);
    return () => clearInterval(interval);
  }, [url]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────
  // Use refs for all handler functions to avoid stale closures and
  // prevent the effect from re-running on every render (which would
  // remove and re-add the event listener constantly).
  const togglePlayRef = useRef(togglePlay);
  const toggleMuteRef = useRef(toggleMute);
  const skipTimeRef = useRef(skipTime);
  const changeVolumeRef = useRef(changeVolume);
  const toggleFullscreenRef = useRef(toggleFullscreen);
  const showControlsTempRef = useRef(showControlsTemp);
  const takeScreenshotRef = useRef(takeScreenshot);
  const toggleTheaterModeRef = useRef(toggleTheaterMode);
  const hlsSubtitlesRef = useRef(hlsSubtitles);
  const changeSubtitleRef = useRef(changeSubtitle);
  const volumeRef = useRef(volume);
  togglePlayRef.current = togglePlay;
  toggleMuteRef.current = toggleMute;
  skipTimeRef.current = skipTime;
  changeVolumeRef.current = changeVolume;
  toggleFullscreenRef.current = toggleFullscreen;
  showControlsTempRef.current = showControlsTemp;
  takeScreenshotRef.current = takeScreenshot;
  toggleTheaterModeRef.current = toggleTheaterMode;
  hlsSubtitlesRef.current = hlsSubtitles;
  changeSubtitleRef.current = changeSubtitle;
  volumeRef.current = volume;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k': e.preventDefault(); togglePlayRef.current(); showControlsTempRef.current(); break;
        case 'arrowright': e.preventDefault(); skipTimeRef.current(10); showControlsTempRef.current(); break;
        case 'arrowleft': e.preventDefault(); skipTimeRef.current(-10); showControlsTempRef.current(); break;
        case 'arrowup': e.preventDefault(); changeVolumeRef.current(Math.min(1, volumeRef.current + 0.1)); showControlsTempRef.current(); break;
        case 'arrowdown': e.preventDefault(); changeVolumeRef.current(Math.max(0, volumeRef.current - 0.1)); showControlsTempRef.current(); break;
        case 'f': e.preventDefault(); toggleFullscreenRef.current(); break;
        case 'm': e.preventDefault(); toggleMuteRef.current(); showControlsTempRef.current(); break;
        case 'j': e.preventDefault(); skipTimeRef.current(-10); showControlsTempRef.current(); break;
        case 'l': e.preventDefault(); skipTimeRef.current(10); showControlsTempRef.current(); break;
        case 's': e.preventDefault(); takeScreenshotRef.current(); break;
        case 't': e.preventDefault(); toggleTheaterModeRef.current(); break;
        case 'c': e.preventDefault(); if (hlsSubtitlesRef.current.length > 0) changeSubtitleRef.current(currentSubtitleRef.current === -1 ? 0 : -1); showControlsTempRef.current(); break;
        case 'd': e.preventDefault(); break; // Download removed
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // ─── Touch/Click handling — instant response on mobile ──────────
  // Problem: Mobile browsers fire BOTH onTouchStart (container) AND onClick (video)
  // causing a conflict: touch shows controls → click immediately hides them → nothing happens.
  // Fix: Use touchend on the video for mobile, prevent the synthetic click.
  const touchHandledRef = useRef(false);

  const handleVideoClick = (e: React.MouseEvent) => {
    // If touch already handled this, skip the synthetic click
    if (touchHandledRef.current) {
      e.preventDefault();
      return;
    }
    // If the video is muted (autoplay policy), unmute on first click
    const v = videoRef.current;
    if (v && v.muted) {
      v.muted = false;
      setMuted(false);
      setShowUnmuteOverlay(false);
      return; // don't toggle play — just unmute
    }
    // Desktop only: instant play/pause
    if (!isMobileRef.current) {
      togglePlay();
      showControlsTemp();
    }
  };

  // Mobile touch handler — fires BEFORE the synthetic click
  const handleVideoTouchEnd = (e: React.TouchEvent) => {
    if (!isMobileRef.current) return;
    // Set flag to suppress the synthetic click that follows
    touchHandledRef.current = true;
    setTimeout(() => { touchHandledRef.current = false; }, 500);

    // Toggle controls — INSTANT
    if (showControls) {
      setShowControls(false);
      setActiveMenu(null);
    } else {
      showControlsTemp();
    }
  };

  // Double-click handler for seek ±10s (desktop only)
  const handleVideoDoubleClick = (e: React.MouseEvent) => {
    if (isMobileRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = (e.clientX - rect.left) / rect.width;
    if (relX < 0.5) {
      skipTime(-10);
      setSeekRipple({ x: relX * rect.width, dir: 'left' });
    } else {
      skipTime(10);
      setSeekRipple({ x: relX * rect.width, dir: 'right' });
    }
    setTimeout(() => setSeekRipple(null), 600);
  };

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

  // Hover thumbnail state — YouTube-style preview of the frame at hovered time.
  // We capture a frame from the video element at the hover position using a
  // hidden canvas. Throttled to ~5fps so we don't kill the main thread.
  const [hoverThumb, setHoverThumb] = useState<string | null>(null);
  const lastThumbCaptureRef = useRef(0);
  const hoverThumbnailCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleProgressHover = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    setHoverTime(pct * duration);
    setHoverX(e.clientX - rect.left);

    // ── Capture thumbnail of the frame at hovered time ──
    // We DON'T seek the video (would be janky) — instead we draw the CURRENT
    // video frame to a canvas + show that. True hover-preview would require
    // either a separate video element or VTT thumbnails file (which we don't
    // have). This is a "good enough" approximation — shows the current frame
    // so the user gets visual feedback while hovering.
    // Throttle to 5fps (every 200ms) to avoid killing the main thread.
    const now = Date.now();
    if (now - lastThumbCaptureRef.current < 200) return;
    lastThumbCaptureRef.current = now;
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    try {
      if (!hoverThumbnailCanvasRef.current) {
        hoverThumbnailCanvasRef.current = document.createElement('canvas');
      }
      const canvas = hoverThumbnailCanvasRef.current;
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      setHoverThumb(canvas.toDataURL('image/jpeg', 0.6));
    } catch {
      // CORS-tainted canvas — can't capture. Just don't show a thumbnail.
      setHoverThumb(null);
    }
  };

  return (
    <>
    <style dangerouslySetInnerHTML={{ __html: SKIP_OVERLAY_STYLES }} />
    <div
      ref={containerRef}
      id="hls-player-container"
      data-player-container
      className="relative w-full bg-black overflow-hidden group select-none"
      style={theaterModeProp ? { height: '100%', width: '100%' } : { aspectRatio: '16 / 9' }}
      onMouseMove={showControlsTemp}
      onMouseLeave={() => { if (playing) { setShowControls(false); setActiveMenu(null); } }}
      onTouchStart={(e) => {
        // Only handle touches on the container (not on the video — video has its own handler)
        const target = e.target as HTMLElement;
        const isOnVideo = target.tagName === 'VIDEO';
        if (isOnVideo) return; // let the video's touchend handle it

        const isOnControls = target.closest('[data-controls-area]');
        if (isOnControls && showControls) {
          showControlsTemp();
        } else if (!showControls) {
          showControlsTemp();
        }
      }}
      onTouchEnd={() => { /* video touchend handles taps on video, container handles taps on padding */ }}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        onClick={handleVideoClick}
        onTouchEnd={handleVideoTouchEnd}
        onDoubleClick={handleVideoDoubleClick}
        crossOrigin={undefined}
      >
        {(subtitleTracks || []).map((t, i) => {
          // The subtitle URL is ALREADY wrapped through /api/stream (which
          // handles SRT→VTT conversion + sends the correct Referer header).
          // Just use t.url directly — no need to proxify again here.
          //
          // The `default` attribute auto-selects the track matching the user's
          // preferred subtitle language (from Subtitle Settings). The auto-enable
          // effect above also sets mode='hidden' for the same track — this is
          // a belt-and-suspenders approach because <track default> doesn't work
          // reliably in all browsers.
          const preferredLang = subtitleSettings.defaultSubtitleLang || "en";
          const isPreferred = preferredLang !== "off" && subtitleLangMatches(t.lang, preferredLang);
          // If no track matches the preferred lang, fall back to the first one
          // (only when no HLS-embedded subs exist — those handle their own default)
          const isFallback = i === 0 && hlsSubtitles.length === 0 && !(subtitleTracks || []).some(s => subtitleLangMatches(s.lang, preferredLang));
          const trackSrc = t.url;
          return (
            <track
              key={`ext-sub-${i}-${t.url}`}
              kind="subtitles"
              src={trackSrc}
              srcLang={t.lang || 'en'}
              label={t.label || t.lang || 'English'}
              default={isPreferred || isFallback}
            />
          );
        })}
      </video>

      {/* ═══ Custom Subtitle Overlay — replaces native ::cue ═══ */}
      <CustomSubtitleOverlay
        videoRef={videoRef}
        settings={subtitleSettings}
        activeTrackIndex={currentSubtitle}
        controlsVisible={showControls}
        isMobile={isMobileRef.current}
      />

      {/* ═══ Loading spinner — shows during initial load AND buffering ═══ */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-2">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-gray-400/10" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-white animate-spin" style={{ animationDuration: '0.8s' }} />
              <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-white/40 animate-spin" style={{ animationDuration: '1.2s', animationDirection: 'reverse' }} />
            </div>
            <p className="text-gray-300/40 text-xs font-medium">Buffering...</p>
          </div>
        </div>
      )}

      {/* ═══ Error state ═══ */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="text-center px-6 max-w-sm">
            <div className="w-16 h-16 rounded-full bg-gray-400/5 backdrop-blur-md border border-gray-400/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-300/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-gray-300/80 text-sm mb-4">{error}</p>
            <button onClick={() => onProviderFailed?.()} className="px-6 py-2.5 bg-gray-400 text-black text-xs font-bold rounded-full hover:bg-gray-400/90 hover:scale-105 active:scale-95 transition-all">
              Switch Server
            </button>
          </div>
        </div>
      )}

      {/* ═══ Center play button — glass with pulse ring ═══ */}
      {!playing && !loading && !error && (
        <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center z-10 group/play">
          <div className="relative">
            {/* Pulse ring */}
            <div className="absolute inset-0 rounded-full bg-gray-400/20 animate-ping" style={{ animationDuration: '2s' }} />
            {/* Main button */}
            <div className="relative w-20 h-20 rounded-full bg-gray-400/10 backdrop-blur-xl border border-gray-400/20 flex items-center justify-center group-hover/play:scale-110 group-hover/play:bg-gray-400/20 transition-all duration-300 shadow-2xl">
              <svg className="w-8 h-8 text-gray-300 ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        </button>
      )}

      {/* ═══ "Tap to unmute" overlay — shows when browser autoplay policy
          muted the video. Users think sound is broken without this. ═══ */}
      {showUnmuteOverlay && playing && !loading && (
        <button
          onClick={() => {
            const v = videoRef.current;
            if (v) {
              v.muted = false;
              setMuted(false);
              setShowUnmuteOverlay(false);
            }
          }}
          className="absolute top-4 right-4 z-30 flex items-center gap-2 bg-black/80 backdrop-blur-md border border-white/20 rounded-full px-4 py-2 text-xs font-bold text-white hover:bg-black/90 transition-all animate-in fade-in slide-in-from-top-2 duration-300"
        >
          {/* Muted speaker icon */}
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
          Tap to unmute
        </button>
      )}

      {/* ═══ Seek ripple animation (double-tap) ═══ */}
      {seekRipple && (
        <div
          className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-20"
          style={{ left: seekRipple.x, transform: 'translate(-50%, -50%)' }}
        >
          <div className="relative flex flex-col items-center gap-2">
            <div className="w-20 h-20 rounded-full bg-gray-400/20 backdrop-blur-md border border-gray-400/20 flex items-center justify-center animate-ping" style={{ animationDuration: '0.6s' }}>
              <svg className="w-10 h-10 text-gray-300" viewBox="0 0 24 24" fill="currentColor">
                {seekRipple.dir === 'left'
                  ? <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                  : <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" style={{ transform: 'scaleX(-1)' }} />}
              </svg>
            </div>
            <span className="text-gray-300 text-xs font-bold bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full">10s</span>
          </div>
        </div>
      )}

      {/* ═══ Skip Intro — small pill button (NOT full-screen) ═══ */}
      {showSkipIntro && intro && (
        <button
          onClick={skipIntro}
          className="absolute bottom-28 right-6 z-20 flex items-center gap-2 bg-gray-400/15 backdrop-blur-xl border border-gray-400/25 text-gray-300 text-xs font-bold px-5 py-2.5 rounded-full hover:bg-gray-400/25 hover:scale-105 active:scale-95 transition-all shadow-2xl"
          style={{ animation: 'skipButtonIn 0.3s ease-out' }}
        >
          Skip Intro
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      )}

      {/* ═══ Skip Outro — small pill button (NOT full-screen) ═══ */}
      {showSkipOutro && outro && (
        <button
          onClick={skipOutro}
          className="absolute bottom-28 right-6 z-20 flex items-center gap-2 bg-gray-400/15 backdrop-blur-xl border border-gray-400/25 text-gray-300 text-xs font-bold px-5 py-2.5 rounded-full hover:bg-gray-400/25 hover:scale-105 active:scale-95 transition-all shadow-2xl"
          style={{ animation: 'skipButtonIn 0.3s ease-out' }}
        >
          Skip Outro
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      )}

      {/* ═══ Screenshot flash overlay ═══ */}
      {screenshotFlash && (
        <div className="absolute inset-0 bg-gray-400 animate-pulse pointer-events-none z-30" style={{ animationDuration: '0.3s' }} />
      )}

      {/* ═══ Toast notifications (screenshot/download) ═══ */}
      {(screenshotToast || downloadToast) && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="bg-black/70 backdrop-blur-xl border border-gray-400/15 text-gray-300 text-xs font-medium px-4 py-2 rounded-full shadow-2xl flex items-center gap-2">
            {screenshotToast ? (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M9 4v3h6V4h2v3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3V4h2zm11 6H4v8h16v-8zm-5 1l2.5 3.5L19 14l1.5 2h-9L9 13l2.5 2z" /></svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V5a3 3 0 0 0-6 0v4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2z" /></svg>
            )}
            {screenshotToast || downloadToast}
          </div>
        </div>
      )}

      {/* Hidden canvas for screenshots */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ═══ CONTROLS — clean bottom bar with gap ═══ */}
      <div
        data-controls-area
        className={`absolute bottom-0 left-0 right-0 transition-all duration-300 z-30 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        onTouchStart={() => { showControlsTemp(); }}
        onMouseDown={() => { showControlsTemp(); }}
      >
        {/* Gradient fade from transparent to dark at the bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />
        
        {/* ═══ Progress bar — thin, expands on hover ═══ */}
        <div
          className="relative h-1 hover:h-1.5 bg-white/10 cursor-pointer transition-all group/bar mx-3 rounded-full"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            seek(pct * duration);
            showControlsTemp();
          }}
          onMouseMove={handleProgressHover}
          onMouseLeave={() => { setHoverTime(null); setHoverThumb(null); }}
        >
          {/* Buffered */}
          <div className="absolute h-full bg-white/20 transition-all rounded-full" style={{ width: `${bufferedProgress}%` }} />
          {/* Played */}
          <div
            className="absolute h-full transition-all rounded-full"
            style={{
              width: `${progress}%`,
              background: 'rgba(255, 255, 255, 0.9)',
            }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover/bar:opacity-100 transition-all duration-200 group-hover/bar:scale-125" style={{ boxShadow: '0 0 8px rgba(255,255,255,0.5)' }} />
          </div>
          {/* Hover thumbnail preview — YouTube-style: shows the actual video frame at the hovered time */}
          {hoverTime !== null && (
            <div
              className="absolute bottom-full mb-2 -translate-x-1/2 pointer-events-none z-40"
              style={{ left: `${hoverX}px` }}
            >
              <div className="flex flex-col items-center gap-1">
                {/* Thumbnail image — captured from video via canvas */}
                <div className="w-32 h-18 bg-black/80 border border-gray-400/20 rounded overflow-hidden shadow-2xl">
                  {hoverThumb ? (
                    <img src={hoverThumb} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                {/* Timestamp label */}
                <div className="bg-black/80 text-gray-300 text-[10px] font-mono px-2 py-0.5 rounded whitespace-nowrap">
                  {fmt(hoverTime)}
                </div>
              </div>
            </div>
          )}
          {/* Chapter markers */}
          {intro && duration > 0 && (
            <div className="absolute top-0 w-0.5 h-full bg-gray-400/40" style={{ left: `${(intro.start / duration) * 100}%` }} />
          )}
          {outro && duration > 0 && (
            <div className="absolute top-0 w-0.5 h-full bg-gray-400/40" style={{ left: `${(outro.start / duration) * 100}%` }} />
          )}
        </div>

        {/* ═══ Control bar — clean layout with gap ═══ */}
        {/* LEFT: PrevEp | Play | NextEp | Volume | Time */}
        {/* RIGHT: Skip10 | Skip10 | CC | Settings | Theater | Fullscreen */}
        <div className="relative flex items-center gap-1.5 px-4 pb-3 pt-2">

          {/* ── Previous Episode ── */}
          {prevEp != null && onPrevEp && (
            <button
              onClick={() => { onPrevEp(); showControlsTemp(); }}
              className="w-8 h-8 flex items-center justify-center text-gray-300 hover:scale-110 active:scale-95 transition-all"
              title="Previous episode (P)"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" /></svg>
            </button>
          )}

          {/* ── Play/Pause ── */}
          <button
            onClick={() => { togglePlay(); showControlsTemp(); }}
            className="w-9 h-9 flex items-center justify-center text-gray-300 hover:scale-110 active:scale-95 transition-all"
            title="Play/Pause (Space)"
          >
            {playing ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>

          {/* ── Next Episode ── */}
          {nextEp != null && onNextEp && (
            <button
              onClick={() => { onNextEp(); showControlsTemp(); }}
              className="w-8 h-8 flex items-center justify-center text-gray-300 hover:scale-110 active:scale-95 transition-all"
              title="Next episode (N)"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
          )}

          {/* ── Volume — expands slider on hover ── */}
          <div
            className="flex items-center gap-1.5"
            onMouseEnter={() => setVolumeHover(true)}
            onMouseLeave={() => setVolumeHover(false)}
          >
            <button
              onClick={() => { toggleMute(); showControlsTemp(); }}
              className="w-8 h-8 flex items-center justify-center text-gray-300 hover:scale-110 active:scale-95 transition-all"
              title="Mute (M)"
            >
              {muted || volume === 0 ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" /></svg>
              )}
            </button>
            <input
              type="range" min="0" max="1" step="0.05"
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(parseFloat(e.target.value))}
              className={`h-1 accent-gray-400 cursor-pointer transition-all duration-300 hidden sm:block ${volumeHover ? 'w-16' : 'w-0'}`}
              style={{ background: `linear-gradient(to right, white ${volume * 100}%, rgba(200,200,200,0.2) ${volume * 100}%)` }}
            />
          </div>

          {/* ── Timestamp • Title (Miruro style — title inline with time) ── */}
          <span className="text-xs font-medium text-gray-300 tabular-nums whitespace-nowrap truncate">
            {fmt(currentTime)} <span className="text-gray-300/40">/</span> {fmt(duration)}
            {animeTitle && (
              <span className="text-gray-300/40 mx-1.5">•</span>
            )}
            {animeTitle && (
              <span className="text-gray-300/60 font-normal truncate">{animeTitle}</span>
            )}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* ── Skip back 10s ── */}
          <button
            onClick={() => { skipTime(-10); showControlsTemp(); }}
            className="w-8 h-8 flex items-center justify-center text-gray-300 hover:scale-110 active:scale-95 transition-all hidden sm:flex"
            title="Back 10s (J)"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
          </button>

          {/* ── Skip forward 10s ── */}
          <button
            onClick={() => { skipTime(10); showControlsTemp(); }}
            className="w-8 h-8 flex items-center justify-center text-gray-300 hover:scale-110 active:scale-95 transition-all hidden sm:flex"
            title="Forward 10s (L)"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'scaleX(-1)' }}><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
          </button>

          {/* ── CC / Subtitles ── */}
          {(hlsSubtitles.length > 0 || (subtitleTracks && subtitleTracks.length > 0)) && (
            <div className="relative">
              <button
                onClick={() => { setActiveMenu(activeMenu === 'subtitles' ? null : 'subtitles'); setShowSubtitleSettings(false); showControlsTemp(); }}
                className={`w-8 h-8 flex items-center justify-center hover:scale-110 active:scale-95 transition-all ${currentSubtitle !== -1 ? 'text-gray-300' : 'text-gray-300/50'}`}
                title="Subtitles (C)"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z" /></svg>
              </button>
              {activeMenu === 'subtitles' && !showSubtitleSettings && (
                <GlassMenu>
                  <MenuLabel>Subtitles</MenuLabel>
                  <MenuItem active={currentSubtitle === -1} onClick={() => { changeSubtitle(-1); showControlsTemp(); }}>Off</MenuItem>
                  {hlsSubtitles.length > 0 && (subtitleTracks || []).length === 0 && (
                    hlsSubtitles.map((sub, i) => (
                      <MenuItem key={`hls-${i}`} active={currentSubtitle === i} onClick={() => { changeSubtitle(i); showControlsTemp(); }}>
                        {sub.name || sub.lang || `Track ${i + 1}`}
                      </MenuItem>
                    ))
                  )}
                  {(subtitleTracks || []).map((sub, i) => {
                    const idx = hlsSubtitles.length + i;
                    return (
                      <MenuItem key={`ext-${i}`} active={currentSubtitle === idx} onClick={() => { changeSubtitle(idx); showControlsTemp(); }}>
                        {sub.label || sub.lang || `External ${i + 1}`}
                      </MenuItem>
                    );
                  })}
                  <div className="border-t border-gray-400/10 mt-1 pt-1">
                    <button
                      onClick={() => {
                        setActiveMenu(null);
                        setShowSubtitleSettings(true);
                        showControlsTemp();
                      }}
                      className="block w-full text-left px-3 py-1.5 text-xs text-gray-300/60 hover:bg-gray-400/10 hover:text-gray-300 transition-all flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14v3h-1V6h-5v12h2v1H9v-1h2V6H6v1H5V4z M3 18h6v1H3z M15 18h6v1h-6z M9 18h6v1H9z" /></svg>
                      Subtitle settings
                    </button>
                  </div>
                </GlassMenu>
              )}
              {showSubtitleSettings && (
                <SubtitleSettingsPanel
                  settings={subtitleSettings}
                  onUpdate={updateSubtitleSettings}
                  onReset={resetSubtitleSettings}
                  onClose={() => setShowSubtitleSettings(false)}
                />
              )}
            </div>
          )}

          {/* ── Theater Mode ── */}
          {onTheaterMode && (
            <button
              onClick={toggleTheaterMode}
              className={`w-8 h-8 flex items-center justify-center hover:scale-110 active:scale-95 transition-all ${theaterMode ? 'text-gray-300' : 'text-gray-300/70'}`}
              title="Theater mode (T)"
            >
              {theaterMode ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8z" /></svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 7H5c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm0 8H5V9h14v6z" /></svg>
              )}
            </button>
          )}

          {/* ── Settings Gear — opens hierarchical settings menu (Miruro style) ── */}
          <div className="relative">
            <button
              onClick={() => {
                const willOpen = activeMenu !== 'settings';
                setActiveMenu(willOpen ? 'settings' : null);
                if (!willOpen) setSettingsSubmenu(null);
                setShowSubtitleSettings(false);
                showControlsTemp();
              }}
              className={`w-8 h-8 flex items-center justify-center text-gray-300 hover:scale-110 active:scale-95 transition-all ${activeMenu === 'settings' ? 'text-gray-300' : 'text-gray-300/80'} ${activeMenu === 'settings' ? 'rotate-45' : ''}`}
              title="Settings"
              style={{ transition: 'transform 0.3s ease' }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg>
            </button>
            {activeMenu === 'settings' && (
              <GlassMenu>
                {/* ═══ ROOT MENU — 6 categories with chevrons (Miruro style) ═══ */}
                {!settingsSubmenu && (
                  <>
                    {/* Volume Boost — shows current % */}
                    <SettingsRow
                      icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" /></svg>}
                      label="Volume Boost"
                      value={volumeBoost > 0 ? `${volumeBoost}%` : '0%'}
                      onClick={() => setSettingsSubmenu('volume_boost')}
                    />
                    {/* Accessibility */}
                    <SettingsRow
                      icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="4" r="2" /><path d="M19 13v-2c-1.54.02-3.09-.75-4.07-1.83l-1.29-1.43c-.17-.19-.38-.34-.61-.45-.01 0-.01-.01-.02-.01H13c-.35-.2-.75-.31-1.19-.26C10.76 7.11 10 8.04 10 9.09V15c0 1.1.9 2 2 2h5v5h2v-5.5c0-1.1-.9-2-2-2h-3v-3.45c1.04 1 2.41 1.65 3.93 1.85.07.01.14.04.21.04.01 0 .02.01.03.01.26 0 .5-.07.71-.18.18-.1.32-.27.41-.46.12-.21.18-.45.18-.71 0-.27-.07-.52-.18-.71z" /></svg>}
                      label="Accessibility"
                      value=""
                      onClick={() => setSettingsSubmenu('accessibility')}
                    />
                    {/* Captions — only show if we have subtitle tracks */}
                    {(hlsSubtitles.length > 0 || (subtitleTracks && subtitleTracks.length > 0)) && (
                      <SettingsRow
                        icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z" /></svg>}
                        label="Captions"
                        value={
                          currentSubtitle === -1 ? 'Off' :
                          currentSubtitle < hlsSubtitles.length
                            ? (hlsSubtitles[currentSubtitle]?.name || hlsSubtitles[currentSubtitle]?.lang || 'On')
                            : (subtitleTracks?.[currentSubtitle - hlsSubtitles.length]?.label || 'On')
                        }
                        onClick={() => setSettingsSubmenu('captions')}
                      />
                    )}
                    {/* Speed */}
                    <SettingsRow
                      icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2.05v3.03c3.94.49 7 3.85 7 7.92 0 3.96-2.91 7.25-6.72 7.87l-.99.13v3.02l1.14-.16C18 23.06 22 18.49 22 13c0-5.27-3.59-9.71-8.44-10.95L13 2.05zM8 5.08V8c-1.2.6-2 1.85-2 3.28v.64c0 1.43.8 2.68 2 3.28v2.92C5.32 17.35 4 15.24 4 12.92v-.64C4 9.76 5.32 7.65 8 6.5V5.08zM10.18 13.5c0 .42.5.66.83.37l3.42-2.85c.27-.22.27-.62 0-.84l-3.42-2.85c-.33-.29-.83-.05-.83.37v5.8z" /></svg>}
                      label="Speed"
                      value={playbackRate === 1 ? 'Normal' : `${playbackRate}x`}
                      onClick={() => setSettingsSubmenu('speed')}
                    />
                    {/* Audio Track — read from HLS manifest */}
                    {audioTracks.length > 0 && (
                      <SettingsRow
                        icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>}
                        label="Audio Track"
                        value={
                          audioTracks[currentAudioTrack]?.name ||
                          audioTracks[currentAudioTrack]?.lang ||
                          (audioTracks.length === 1 ? 'Default' : 'Unknown')
                        }
                        onClick={() => setSettingsSubmenu('audio_track')}
                      />
                    )}
                    {/* Quality — read from HLS manifest */}
                    {qualities.length > 0 && (
                      <SettingsRow
                        icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h14c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm-8.06 11.06L9 12.12l-1.94 1.94-1.41-1.41L7.59 10.7 5.65 8.76l1.41-1.41L9 9.29l1.94-1.94 1.41 1.41L10.41 10.7l1.94 1.95-1.41 1.41zM18 14h-6v-2h6v2zm0-4h-6V8h6v2z" /></svg>}
                        label="Quality"
                        value={
                          currentQuality === -1 ? 'Auto' :
                          qualities[currentQuality]?.height
                            ? `${qualities[currentQuality].height}p`
                            : 'Auto'
                        }
                        onClick={() => setSettingsSubmenu('quality')}
                      />
                    )}
                  </>
                )}

                {/* ═══ VOLUME BOOST SUBMENU ═══ */}
                {settingsSubmenu === 'volume_boost' && (
                  <>
                    <SettingsBack label="Volume Boost" onBack={() => setSettingsSubmenu(null)} />
                    <div className="px-3 py-2">
                      <input
                        type="range" min="0" max="100" step="25"
                        value={volumeBoost}
                        onChange={(e) => applyVolumeBoost(parseInt(e.target.value))}
                        className="w-full h-1 accent-gray-400 cursor-pointer"
                        style={{ background: `linear-gradient(to right, #02a9ff ${volumeBoost}%, rgba(200,200,200,0.2) ${volumeBoost}%)` }}
                      />
                      <div className="flex justify-between text-[10px] text-gray-300/50 mt-1.5">
                        <span>0%</span>
                        <span className="text-gray-300 font-bold">{volumeBoost}%</span>
                        <span>100%</span>
                      </div>
                    </div>
                    {[0, 25, 50, 75, 100].map(pct => (
                      <MenuItem key={pct} active={volumeBoost === pct} onClick={() => { applyVolumeBoost(pct); }}>
                        {pct}%{pct === 0 && ' (Native)'}
                      </MenuItem>
                    ))}
                  </>
                )}

                {/* ═══ ACCESSIBILITY SUBMENU ═══ */}
                {settingsSubmenu === 'accessibility' && (
                  <>
                    <SettingsBack label="Accessibility" onBack={() => setSettingsSubmenu(null)} />
                    <MenuItem active={subtitleSettings.fontSize >= 32} onClick={() => updateSubtitleSettings({ fontSize: subtitleSettings.fontSize >= 32 ? 20 : 36 })}>
                      Large subtitle text
                    </MenuItem>
                    <MenuItem active={subtitleSettings.bgOpacity >= 70} onClick={() => updateSubtitleSettings({ bgOpacity: subtitleSettings.bgOpacity >= 70 ? 0 : 80 })}>
                      High contrast subtitles
                    </MenuItem>
                    <MenuItem active={subtitleSettings.syncDelay !== 0} onClick={() => updateSubtitleSettings({ syncDelay: subtitleSettings.syncDelay !== 0 ? 0 : -0.5 })}>
                      Subtitle delay compensation
                    </MenuItem>
                  </>
                )}

                {/* ═══ CAPTIONS SUBMENU ═══ */}
                {settingsSubmenu === 'captions' && (
                  <>
                    <SettingsBack label="Captions" onBack={() => setSettingsSubmenu(null)} />
                    <MenuItem active={currentSubtitle === -1} onClick={() => { changeSubtitle(-1); }}>Off</MenuItem>
                    {hlsSubtitles.length > 0 && (subtitleTracks || []).length === 0 && (
                      hlsSubtitles.map((sub, i) => (
                        <MenuItem key={`hls-${i}`} active={currentSubtitle === i} onClick={() => { changeSubtitle(i); }}>
                          {sub.name || sub.lang || `Track ${i + 1}`}
                        </MenuItem>
                      ))
                    )}
                    {(subtitleTracks || []).map((sub, i) => {
                      const idx = hlsSubtitles.length + i;
                      return (
                        <MenuItem key={`ext-${i}`} active={currentSubtitle === idx} onClick={() => { changeSubtitle(idx); }}>
                          {sub.label || sub.lang || `External ${i + 1}`}
                        </MenuItem>
                      );
                    })}
                    <div className="border-t border-gray-400/10 mt-1 pt-1">
                      <button
                        onClick={() => {
                          setActiveMenu(null);
                          setSettingsSubmenu(null);
                          setShowSubtitleSettings(true);
                          showControlsTemp();
                        }}
                        className="block w-full text-left px-3 py-1.5 text-xs text-gray-300/60 hover:bg-gray-400/10 hover:text-gray-300 transition-all flex items-center gap-2"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14v3h-1V6h-5v12h2v1H9v-1h2V6H6v1H5V4z M3 18h6v1H3z M15 18h6v1h-6z M9 18h6v1H9z" /></svg>
                        Subtitle settings
                      </button>
                    </div>
                  </>
                )}

                {/* ═══ SPEED SUBMENU ═══ */}
                {settingsSubmenu === 'speed' && (
                  <>
                    <SettingsBack label="Speed" onBack={() => setSettingsSubmenu(null)} />
                    {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(rate => (
                      <MenuItem key={rate} active={playbackRate === rate} onClick={() => { changePlaybackRate(rate); }}>
                        {rate === 1 ? 'Normal' : `${rate}x`}
                      </MenuItem>
                    ))}
                  </>
                )}

                {/* ═══ AUDIO TRACK SUBMENU — read from HLS manifest ═══ */}
                {settingsSubmenu === 'audio_track' && (
                  <>
                    <SettingsBack label="Audio Track" onBack={() => setSettingsSubmenu(null)} />
                    {audioTracks.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-300/40">No audio tracks available</div>
                    )}
                    {audioTracks.map((track, i) => (
                      <MenuItem key={i} active={currentAudioTrack === i} onClick={() => { changeAudioTrack(i); }}>
                        {track.name || track.lang || `Track ${i + 1}`}
                      </MenuItem>
                    ))}
                  </>
                )}

                {/* ═══ QUALITY SUBMENU — read from HLS manifest ═══ */}
                {settingsSubmenu === 'quality' && (
                  <>
                    <SettingsBack label="Quality" onBack={() => setSettingsSubmenu(null)} />
                    <MenuItem active={currentQuality === -1} onClick={() => { changeQuality(-1); }}>Auto</MenuItem>
                    {qualities.map((q, i) => (
                      <MenuItem key={i} active={currentQuality === i} onClick={() => { changeQuality(i); }}>
                        {q.height ? `${q.height}p` : `Level ${i + 1}`}
                      </MenuItem>
                    ))}
                  </>
                )}
              </GlassMenu>
            )}
          </div>


          {/* ── Fullscreen ── */}
          <button
            onClick={() => { toggleFullscreen(); showControlsTemp(); }}
            className="w-8 h-8 flex items-center justify-center text-gray-300 hover:scale-110 active:scale-95 transition-all"
            title="Fullscreen (F)"
          >
            {fullscreen ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* ═══ Download Modal — fetches download links from AnimeX API ═══ */}
      {showDownloadModal && (
        <DownloadModal
          animeId={animeId || ''}
          episodeNum={episodeNum || 1}
          onClose={() => setShowDownloadModal(false)}
        />
      )}
    </div>
    </>
  );
}

// ─── Download Modal ─────────────────────────────────────────────
function DownloadModal({ animeId, episodeNum, onClose }: { animeId: string; episodeNum: number; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<Array<{ text: string; decodedUrl: string }>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDownloads = async () => {
      try {
        setLoading(true);
        setError('');
        let title = '';
        try {
          const titleRes = await fetch('/api/anilist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `query($id:Int){Media(id:$id,type:ANIME){title{english romaji}}}`,
              variables: { id: parseInt(animeId) },
            }),
          });
          if (titleRes.ok) {
            const titleData = await titleRes.json();
            title = titleData?.data?.Media?.title?.english || titleData?.data?.Media?.title?.romaji || '';
          }
        } catch { /* ignore */ }

        if (!title) {
          setError('Could not determine anime title');
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/anime/download?title=${encodeURIComponent(title)}&auto=1`);
        if (!res.ok) {
          setError('Failed to fetch download links');
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (data.links && data.links.length > 0) {
          setLinks(data.links);
        } else {
          setError('No download links found for this anime');
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load downloads');
      } finally {
        setLoading(false);
      }
    };
    fetchDownloads();
  }, [animeId]);

  // Show only top 2 links (quick access) + "explore more" link
  const quickLinks = links.slice(0, 2);

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-black border border-gray-400/10 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-y-auto"
        style={{ maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-400/10">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-300" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V5a3 3 0 0 0-6 0v4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 6v3h-2v-3H8l4-4 4 4h-3z" /></svg>
            <h3 className="text-sm font-bold text-gray-300">Download</h3>
          </div>
          <button onClick={onClose} className="text-gray-300/40 hover:text-gray-300 transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-gray-400/20 border-t-white rounded-full animate-spin" />
              <span className="ml-2.5 text-xs text-gray-300/50">Finding links...</span>
            </div>
          )}

          {error && !loading && (
            <div className="text-center py-6">
              <p className="text-xs text-gray-300/40 mb-3">{error}</p>
              {/* Even on error, show the explore link */}
              <a
                href="https://animex.one/community/download"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#1E88FF] hover:underline"
              >
                Want to explore downloads?
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </a>
            </div>
          )}

          {!loading && !error && quickLinks.length > 0 && (
            <div>
              {/* Top 2 download links */}
              <div className="space-y-2">
                {quickLinks.map((link, i) => (
                  <a
                    key={i}
                    href={link.decodedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-3 py-2.5 rounded-xl bg-gray-400/[0.04] border border-gray-400/[0.06] hover:bg-gray-400/[0.08] hover:border-gray-400/15 transition-all group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-gray-400/5 flex items-center justify-center shrink-0 group-hover:bg-gray-400/10 transition-colors">
                        <svg className="w-3 h-3 text-gray-300/50" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V5a3 3 0 0 0-6 0v4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 6v3h-2v-3H8l4-4 4 4h-3z" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-gray-300/80 truncate">
                          {link.text.split('|').pop()?.trim() || link.text}
                        </p>
                        <p className="text-[9px] text-gray-300/30 truncate">{link.decodedUrl}</p>
                      </div>
                      <svg className="w-3 h-3 text-gray-300/30 group-hover:text-gray-300/60 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                  </a>
                ))}
              </div>

              {/* "Want to explore downloads?" link at bottom */}
              <div className="mt-3 pt-3 border-t border-gray-400/8 text-center">
                <a
                  href="https://animex.one/community/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#1E88FF] hover:underline"
                >
                  Want to explore downloads?
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Glass Menu Components ─────────────────────────────────────────
function GlassMenu({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-full right-0 mb-3 bg-black/60 backdrop-blur-2xl border border-gray-400/15 rounded-2xl overflow-y-auto overflow-x-hidden min-w-[120px] max-w-[calc(100vw-2rem)] max-h-[50vh] py-1.5 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
      {children}
    </div>
  );
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1 text-[10px] font-bold text-gray-300/40 uppercase tracking-wider">{children}</div>
  );
}

function MenuItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-400/10 transition-all duration-150 ${active ? 'text-gray-300 font-bold' : 'text-gray-300/60'}`}
    >
      <div className="flex items-center justify-between">
        <span>{children}</span>
        {active && (
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
        )}
      </div>
    </button>
  );
}

// ── Settings Row — Miruro-style row with icon + label + value + chevron ──
// Used in the settings menu ROOT view. Clicking opens the submenu.
function SettingsRow({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-400/10 transition-all duration-150 group/row"
    >
      <div className="flex items-center gap-2.5">
        {/* Icon */}
        <span className="text-gray-300/70 group-hover/row:text-gray-300 transition-colors">{icon}</span>
        {/* Label */}
        <span className="text-gray-300/90 flex-1">{label}</span>
        {/* Current value */}
        {value && <span className="text-gray-300/50 text-[11px]">{value}</span>}
        {/* Chevron */}
        <svg className="w-3 h-3 text-gray-300/40 group-hover/row:text-gray-300/70 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
      </div>
    </button>
  );
}

// ── Settings Back — header row shown at the top of each submenu ──
// Has a back arrow + the submenu title. Clicking returns to the root menu.
function SettingsBack({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-400/10 transition-all duration-150 border-b border-gray-400/10 mb-1"
    >
      <div className="flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-gray-300/70" viewBox="0 0 24 24" fill="currentColor"><path d="M14 7l-5 5 5 5V7z" /></svg>
        <span className="text-gray-300 font-bold">{label}</span>
      </div>
    </button>
  );
}

// ═══ Skip overlay animations ═══
// These must be defined as a style tag injected into the DOM
const SKIP_OVERLAY_STYLES = `
@keyframes skipOverlayIn {
  from { opacity: 0; backdrop-filter: blur(0px); }
  to { opacity: 1; backdrop-filter: blur(8px); }
}
@keyframes skipCardContent {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes skipIconPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.08); opacity: 0.9; }
}
@keyframes skipButtonIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
`;
