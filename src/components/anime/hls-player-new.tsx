'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { proxify, proxifyM3u8 } from '@/lib/proxy';
import { validateSkipTime } from '@/lib/episode-metadata';
import {
  useSubtitleSettings,
  CustomSubtitleOverlay,
  SubtitleSettingsPanel,
} from './subtitle-settings';

interface HLSPlayerProps {
  url: string;
  animeId?: string;
  episodeNum?: number;
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

export default function HLSPlayerNew({
  url, animeId, episodeNum, sourceType = 'hls',
  intro: introProp, outro: outroProp, allStreams, subtitleTracks, onEnded, onProviderFailed, onCanPlay, autoplay = true, autoSkip = false,
}: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const isMobileRef = useRef(false);
  if (typeof window !== 'undefined') isMobileRef.current = 'ontouchstart' in window || window.innerWidth < 768;
  const [qualities, setQualities] = useState<any[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [activeMenu, setActiveMenu] = useState<'quality' | 'subtitles' | 'speed' | null>(null);
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
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ─── Load stream ──────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    setLoading(true);
    setError(null);
    retryCountRef.current = 0;
    setCurrentSubtitle(-1);
    setHlsSubtitles([]);
    onCanPlayFiredRef.current = false; // reset for new stream

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (sourceType === 'mp4' || url.endsWith('.mp4') || url.includes('video.mp4')) {
      // Proxy the MP4 URL through the worker so the correct Referer is sent
      video.src = proxify(url);
      video.load();
      if (autoplay) video.play().catch(() => {});
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        // ─── PERFORMANCE TUNING — optimized for FASTEST initial load ───
        // Strategy: Start at LOWEST quality (360p) for instant first-frame,
        // then ABR auto-upgrades to 1080p within 2-3 seconds as bandwidth
        // is measured. This gives the FASTEST perceived load time.
        // Previous config started at 1080p which meant downloading 5-10MB
        // before any frame appeared — now we download ~500KB first.
        lowLatencyMode: true,            // Enables reduced buffer targets + faster ABR
        backBufferLength: 20,            // 20s back buffer — saves memory, plenty for seeking
        maxBufferLength: 10,             // 10s ahead buffer — minimal wait before playback starts
        maxMaxBufferLength: 120,         // 120s max buffer — grows for smooth long-form playback
        maxBufferSize: 50 * 1000 * 1000, // 50MB max buffer size
        maxBufferHole: 0.5,
        // Start at the LOWEST quality level for FASTEST time-to-first-frame.
        // ABR will auto-upgrade to 1080p within 2-3s on fast connections.
        // -1 = ABR auto-select, 0 = lowest level (fastest first frame).
        startLevel: 0,
        // Assume 5Mbps bandwidth initially — conservative start ensures
        // smooth playback while ABR measures real bandwidth.
        // After 2-3s of measurement, ABR ramps up to full 1080p.
        abrEwmaDefaultEstimate: 5000000,   // 5Mbps — conservative, ramps up fast
        abrBandWidthFactor: 0.8,           // More aggressive quality upgrades
        abrBandWidthUpFactor: 0.7,
        maxStarvationDelay: 1,             // Switch quality instantly if buffer runs dry
        abrEwmaDefaultEstimateMax: 50000000, // 50Mbps max — allows 4K streams
        abrMaxWithRealBitrate: true,        // Use real bitrate from manifest for better ABR
        // ─── TIMEOUTS — fail FAST, retry FAST ───
        // Aggressive timeouts so dead servers don't hold up playback.
        manifestLoadingTimeOut: 6000,      // 6s — proxy+CDN should respond in <3s
        manifestLoadingMaxRetry: 2,        // Only retry twice — move on quickly
        levelLoadingTimeOut: 6000,         // 6s
        levelLoadingMaxRetry: 2,
        fragLoadingTimeOut: 10000,         // 10s per segment — generous even on slow CDNs
        fragLoadingMaxRetry: 3,            // 3 retries — enough to recover from transient errors
        fragLoadingRetryDelay: 250,        // 250ms — retry almost immediately
        // ─── PREFETCH + PROGRESSIVE for instant start ───
        startFragPrefetch: true,           // Prefetch first fragment while parsing manifest
        progressive: true,                 // Stream data progressively (faster TTFF)
        testBandwidth: true,               // Bandwidth test on first fragment for faster ABR
        // ─── SUBTITLES ───
        enableWebVTT: true,
        xhrSetup: (xhr) => { xhr.withCredentials = false; },
      });
      hlsRef.current = hls;
      hls.loadSource(proxifyM3u8(url));
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setQualities(data.levels);
        setLoading(false);
        // Reset retry counter on successful manifest parse
        retryCountRef.current = 0;
        if (autoplay) {
          video.play().catch(() => {
            video.muted = true;
            video.play().catch(() => {});
          });
        }
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_e, data) => {
        setHlsSubtitles(data.subtitleTracks || []);
        if (data.subtitleTracks.length > 0 && hls.subtitleTrack === -1) {
          hls.subtitleTrack = 0;
          setCurrentSubtitle(0);
          // After HLS.js sets the subtitle track, it creates a textTrack with
          // mode='showing' (native rendering). We need to switch it to 'hidden'
          // so only our CustomSubtitleOverlay renders (prevents double subtitles).
          setTimeout(() => {
            const video = videoRef.current;
            if (video) {
              for (let i = 0; i < video.textTracks.length; i++) {
                if (i === 0) video.textTracks[i].mode = 'hidden';
              }
            }
          }, 200);
        }
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

      hls.on(Hls.Events.ERROR, (_e, data) => {
        // Non-fatal errors are expected during streaming (a segment/playlist
        // fetch hiccup) and hls.js already recovers from them on its own —
        // console.warn so they don't trip Next's dev error overlay for
        // something that isn't actually broken.
        const log = data.fatal ? console.error : console.warn;
        log(`[HLS] Error: type=${data.type} details=${data.details} fatal=${data.fatal}`);
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (retryCountRef.current < 3) {
              retryCountRef.current++;
              setTimeout(() => hls.startLoad(), 2000);
            } else {
              setError('Stream failed. Try another server.');
              setLoading(false);
              onProviderFailedRef.current?.();
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
      video.src = proxifyM3u8(url);
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
  }, [url, sourceType, autoplay]);

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
  const CONTROLS_TIMEOUT = isMobileRef.current ? 2500 : 3500;
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

  // ─── Fullscreen ───────────────────────────────────────────────────
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        // Release orientation lock when exiting fullscreen
        try { await (screen.orientation as any)?.unlock(); } catch {}
      } else {
        await containerRef.current?.requestFullscreen();
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

  const seek = (time: number) => { if (videoRef.current) videoRef.current.currentTime = time; };
  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) v.play(); else v.pause();
  };
  const toggleMute = () => {
    const v = videoRef.current; if (!v) return;
    v.muted = !v.muted; setMuted(v.muted);
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

  // ── Auto-enable the first external subtitle track ──
  // The `default` attribute on <track> doesn't always work reliably across
  // browsers (especially when the track loads after the video starts). This
  // effect explicitly enables the first external subtitle track once the
  // video metadata has loaded AND there are no HLS-embedded subtitles.
  // This ensures subtitles show automatically when the user starts watching.
  useEffect(() => {
    if (hlsSubtitles.length > 0) return; // HLS-embedded subs handle their own default
    if (!subtitleTracks || subtitleTracks.length === 0) return;
    const video = videoRef.current;
    if (!video) return;

    const enableFirstSub = () => {
      // video.textTracks includes both HLS-embedded and external <track> elements.
      // External tracks come AFTER HLS tracks in the list. Since we have no HLS
      // subs (checked above), the first external track is at index 0.
      if (video.textTracks.length > 0 && currentSubtitle === -1) {
        // Don't override if the user explicitly turned subs off
        // Use 'hidden' mode — cues fire but native rendering is suppressed
        // (our CustomSubtitleOverlay handles rendering)
        video.textTracks[0].mode = 'hidden';
        setCurrentSubtitle(0);
      }
    };

    // Try immediately (in case metadata already loaded)
    if (video.readyState >= 1) {
      enableFirstSub();
    } else {
      video.addEventListener('loadedmetadata', enableFirstSub, { once: true });
      return () => video.removeEventListener('loadedmetadata', enableFirstSub);
    }
  }, [hlsSubtitles.length, subtitleTracks, currentSubtitle]);

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
      if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
      const video = videoRef.current;
      if (video) for (let i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = 'disabled';
      setCurrentSubtitle(-1);
    } else if (hlsRef.current && track < hlsSubtitles.length) {
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
      // External subtitle (<track> element)
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
  const volumeRef = useRef(volume);
  togglePlayRef.current = togglePlay;
  toggleMuteRef.current = toggleMute;
  skipTimeRef.current = skipTime;
  changeVolumeRef.current = changeVolume;
  toggleFullscreenRef.current = toggleFullscreen;
  showControlsTempRef.current = showControlsTemp;
  takeScreenshotRef.current = takeScreenshot;
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
        case 'd': e.preventDefault(); break; // Download removed
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // ─── Double-tap to seek with ripple ───────────────────────────────
  const handleVideoClick = (e: React.MouseEvent) => {
    const now = Date.now();
    const x = e.clientX;
    if (lastTapRef.current && now - lastTapRef.current.time < 300 && Math.abs(x - lastTapRef.current.x) < 50) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const relX = (x - rect.left) / rect.width;
        if (relX < 0.4) {
          skipTime(-10);
          setSeekRipple({ x: relX * rect.width, dir: 'left' });
          setTimeout(() => setSeekRipple(null), 600);
        } else if (relX > 0.6) {
          skipTime(10);
          setSeekRipple({ x: relX * rect.width, dir: 'right' });
          setTimeout(() => setSeekRipple(null), 600);
        } else {
          togglePlay();
        }
      }
      lastTapRef.current = null;
    } else {
      lastTapRef.current = { time: now, x };
      setTimeout(() => {
        if (lastTapRef.current && Date.now() - lastTapRef.current.time >= 300) {
          // On mobile: single tap toggles controls, NOT play/pause
          // On desktop: single tap toggles play/pause (existing behavior)
          if (isMobileRef.current) {
            if (showControls) {
              setShowControls(false);
              setActiveMenu(null);
            } else {
              showControlsTemp();
            }
          } else {
            togglePlay();
          }
          lastTapRef.current = null;
        }
      }, 300);
    }
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

  const handleProgressHover = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    setHoverTime(pct * duration);
    setHoverX(e.clientX - rect.left);
  };

  return (
    <>
    <style dangerouslySetInnerHTML={{ __html: SKIP_OVERLAY_STYLES }} />
    <div
      ref={containerRef}
      className="relative w-full bg-black overflow-hidden group select-none"
      style={{ aspectRatio: '16 / 9' }}
      onMouseMove={showControlsTemp}
      onMouseLeave={() => { if (playing) { setShowControls(false); setActiveMenu(null); } }}
      onTouchStart={() => { if (!showControls) { showControlsTemp(); } }}
      onTouchEnd={() => { /* auto-hide timeout handles hiding */ }}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        onClick={handleVideoClick}
        crossOrigin={undefined}
      >
        {(subtitleTracks || []).map((t, i) => {
          // The subtitle URL is ALREADY wrapped through /api/stream (which
          // handles SRT→VTT conversion + sends the correct Referer header).
          // Just use t.url directly — no need to proxify again here.
          // The `default` attribute auto-selects the first external subtitle
          // track so it shows immediately when the video starts playing.
          const trackSrc = t.url;
          return (
            <track
              key={`ext-sub-${i}`}
              kind="subtitles"
              src={trackSrc}
              srcLang={t.lang || 'en'}
              label={t.label || t.lang || 'English'}
              default={i === 0 && hlsSubtitles.length === 0}
            />
          );
        })}
      </video>

      {/* ═══ Animated Corner Frames — bold anime-style SVG corners ═══ */}
      <div className="ltv-corner-frame">
        {/* Top-left */}
        <svg className="ltv-corner ltv-corner-tl" viewBox="0 0 100 100" fill="none">
          <path d="M0 0 L80 0 L70 15 L85 10 L75 25 L90 20 L60 40 L0 0 Z" fill="#D4A017" opacity="0.9"/>
          <path d="M0 0 L60 0 L50 8 L0 0 Z" fill="#000" opacity="0.4"/>
        </svg>
        {/* Top-right */}
        <svg className="ltv-corner ltv-corner-tr" viewBox="0 0 100 100" fill="none">
          <path d="M100 0 L20 0 L30 15 L15 10 L25 25 L10 20 L40 40 L100 0 Z" fill="#D4A017" opacity="0.9"/>
          <path d="M100 0 L40 0 L50 8 L100 0 Z" fill="#000" opacity="0.4"/>
        </svg>
        {/* Bottom-left */}
        <svg className="ltv-corner ltv-corner-bl" viewBox="0 0 100 100" fill="none">
          <path d="M0 100 L70 100 L60 85 L75 90 L50 70 L0 100 Z" fill="#1E88FF" opacity="0.7"/>
          <circle cx="20" cy="85" r="4" fill="#fff" opacity="0.3"/>
          <circle cx="32" cy="90" r="3" fill="#fff" opacity="0.2"/>
        </svg>
        {/* Bottom-right */}
        <svg className="ltv-corner ltv-corner-br" viewBox="0 0 100 100" fill="none">
          <path d="M100 100 L30 100 L40 85 L25 90 L50 70 L100 100 Z" fill="#1E88FF" opacity="0.7"/>
          <circle cx="80" cy="85" r="4" fill="#fff" opacity="0.3"/>
          <circle cx="68" cy="90" r="3" fill="#fff" opacity="0.2"/>
        </svg>
      </div>

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
              <div className="absolute inset-0 rounded-full border-2 border-white/10" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-white animate-spin" style={{ animationDuration: '0.8s' }} />
              <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-white/40 animate-spin" style={{ animationDuration: '1.2s', animationDirection: 'reverse' }} />
            </div>
            <p className="text-white/40 text-xs font-medium">Buffering...</p>
          </div>
        </div>
      )}

      {/* ═══ Error state ═══ */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="text-center px-6 max-w-sm">
            <div className="w-16 h-16 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-white/80 text-sm mb-4">{error}</p>
            <button onClick={() => onProviderFailed?.()} className="px-6 py-2.5 bg-white text-black text-xs font-bold rounded-full hover:bg-white/90 hover:scale-105 active:scale-95 transition-all">
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
            <div className="absolute inset-0 rounded-full bg-white/20 animate-ping" style={{ animationDuration: '2s' }} />
            {/* Main button */}
            <div className="relative w-20 h-20 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center group-hover/play:scale-110 group-hover/play:bg-white/20 transition-all duration-300 shadow-2xl">
              <svg className="w-8 h-8 text-white ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        </button>
      )}

      {/* ═══ Seek ripple animation (double-tap) ═══ */}
      {seekRipple && (
        <div
          className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-20"
          style={{ left: seekRipple.x, transform: 'translate(-50%, -50%)' }}
        >
          <div className="relative flex flex-col items-center gap-2">
            <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center animate-ping" style={{ animationDuration: '0.6s' }}>
              <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                {seekRipple.dir === 'left'
                  ? <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                  : <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" style={{ transform: 'scaleX(-1)' }} />}
              </svg>
            </div>
            <span className="text-white text-xs font-bold bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full">10s</span>
          </div>
        </div>
      )}

      {/* ═══ Skip Intro — small pill button (NOT full-screen) ═══ */}
      {showSkipIntro && intro && (
        <button
          onClick={skipIntro}
          className="absolute bottom-28 right-6 z-20 flex items-center gap-2 bg-white/15 backdrop-blur-xl border border-white/25 text-white text-xs font-bold px-5 py-2.5 rounded-full hover:bg-white/25 hover:scale-105 active:scale-95 transition-all shadow-2xl"
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
          className="absolute bottom-28 right-6 z-20 flex items-center gap-2 bg-white/15 backdrop-blur-xl border border-white/25 text-white text-xs font-bold px-5 py-2.5 rounded-full hover:bg-white/25 hover:scale-105 active:scale-95 transition-all shadow-2xl"
          style={{ animation: 'skipButtonIn 0.3s ease-out' }}
        >
          Skip Outro
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      )}

      {/* ═══ Screenshot flash overlay ═══ */}
      {screenshotFlash && (
        <div className="absolute inset-0 bg-white animate-pulse pointer-events-none z-30" style={{ animationDuration: '0.3s' }} />
      )}

      {/* ═══ Toast notifications (screenshot/download) ═══ */}
      {(screenshotToast || downloadToast) && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="bg-black/70 backdrop-blur-xl border border-white/15 text-white text-xs font-medium px-4 py-2 rounded-full shadow-2xl flex items-center gap-2">
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

      {/* ═══ CONTROLS — Floating glass bar ═══ */}
      <div
        className={`absolute bottom-0 left-0 right-0 px-4 pb-4 transition-all duration-300 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        {/* Progress bar — floating, with glow */}
        <div
          className="relative h-1.5 hover:h-2.5 bg-white/15 rounded-full mb-3 cursor-pointer transition-all group/bar"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            seek(pct * duration);
          }}
          onMouseMove={handleProgressHover}
          onMouseLeave={() => setHoverTime(null)}
        >
          {/* Buffered */}
          <div className="absolute h-full bg-white/25 rounded-full transition-all" style={{ width: `${bufferedProgress}%` }} />
          {/* Played — with glow */}
          <div
            className="absolute h-full rounded-full transition-all"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.8), #ffffff)',
              boxShadow: '0 0 10px rgba(255,255,255,0.5)',
            }}
          >
            {/* Scrubber — glass circle */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg opacity-0 group-hover/bar:opacity-100 transition-all duration-200 group-hover/bar:scale-125" style={{ boxShadow: '0 0 15px rgba(255,255,255,0.8)' }} />
          </div>
          {/* Hover preview */}
          {hoverTime !== null && (
            <div
              className="absolute bottom-full mb-3 -translate-x-1/2 bg-black/70 backdrop-blur-md text-white text-[10px] font-mono px-2.5 py-1 rounded-md pointer-events-none whitespace-nowrap border border-white/10"
              style={{ left: `${hoverX}px` }}
            >
              {fmt(hoverTime)}
            </div>
          )}
          {/* Chapter markers */}
          {intro && duration > 0 && (
            <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-2.5 bg-white/50 rounded-full" style={{ left: `${(intro.start / duration) * 100}%` }} />
          )}
          {outro && duration > 0 && (
            <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-2.5 bg-white/50 rounded-full" style={{ left: `${(outro.start / duration) * 100}%` }} />
          )}
        </div>

        {/* Control bar — floating glass pill (compact on mobile) */}
        <div className="flex items-center gap-1 sm:gap-1.5 text-white bg-black/30 backdrop-blur-xl border border-white/10 rounded-full px-2 sm:px-3 py-1 sm:py-1.5 shadow-2xl">
          {/* Play/Pause — glass circle */}
          <button
            onClick={togglePlay}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
            title="Play/Pause (Space)"
          >
            {playing ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
            ) : (
              <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>

          {/* Skip back 10s */}
          <button
            onClick={() => skipTime(-10)}
            className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 hidden sm:flex"
            title="Back 10s (J)"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
          </button>

          {/* Skip forward 10s */}
          <button
            onClick={() => skipTime(10)}
            className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 hidden sm:flex"
            title="Forward 10s (L)"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'scaleX(-1)' }}><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
          </button>

          {/* Volume — expandable (smaller on mobile) */}
          <div
            className="flex items-center gap-1 rounded-full hover:bg-white/10 transition-all duration-200 pr-1 sm:pr-2"
            onMouseEnter={() => setVolumeHover(true)}
            onMouseLeave={() => setVolumeHover(false)}
          >
            <button
              onClick={toggleMute}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
              title="Mute (M)"
            >
              {muted || volume === 0 ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" /></svg>
              )}
            </button>
            <input
              type="range" min="0" max="1" step="0.05"
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(parseFloat(e.target.value))}
              className={`h-1 accent-white cursor-pointer transition-all duration-300 hidden sm:block ${volumeHover ? 'w-16' : 'w-0'}`}
              style={{ background: `linear-gradient(to right, white ${volume * 100}%, rgba(255,255,255,0.2) ${volume * 100}%)` }}
            />
          </div>

          {/* Time */}
          <span className="text-[11px] sm:text-xs font-medium text-white/90 tabular-nums ml-0.5 sm:ml-1 mr-1 sm:mr-2">
            {fmt(currentTime)} <span className="text-white/30">/</span> {fmt(duration)}
          </span>

          <div className="flex-1" />

          {/* Speed — glass pill (compact on mobile) */}
          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'speed' ? null : 'speed')}
              className={`h-8 sm:h-9 px-2 sm:px-3 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 text-[11px] sm:text-xs font-bold ${activeMenu === 'speed' ? 'bg-white/20' : 'hover:bg-white/10'}`}
              title="Speed"
            >
              {playbackRate}x
            </button>
            {activeMenu === 'speed' && (
              <GlassMenu>
                <MenuLabel>Speed</MenuLabel>
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                  <MenuItem key={rate} active={playbackRate === rate} onClick={() => changePlaybackRate(rate)}>
                    {rate}x {rate === 1 && '·'}
                  </MenuItem>
                ))}
              </GlassMenu>
            )}
          </div>

          {/* Quality (smaller on mobile) */}
          {qualities.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setActiveMenu(activeMenu === 'quality' ? null : 'quality')}
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${activeMenu === 'quality' ? 'bg-white/20' : 'hover:bg-white/10'}`}
                title="Quality"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg>
              </button>
              {activeMenu === 'quality' && (
                <GlassMenu>
                  <MenuLabel>Quality</MenuLabel>
                  <MenuItem active={currentQuality === -1} onClick={() => changeQuality(-1)}>Auto</MenuItem>
                  {qualities.map((q, i) => (
                    <MenuItem key={i} active={currentQuality === i} onClick={() => changeQuality(i)}>{q.height}p</MenuItem>
                  ))}
                </GlassMenu>
              )}
            </div>
          )}

          {/* Subtitles (smaller on mobile) */}
          {(hlsSubtitles.length > 0 || (subtitleTracks && subtitleTracks.length > 0)) && (
            <div className="relative">
              <button
                onClick={() => setActiveMenu(activeMenu === 'subtitles' ? null : 'subtitles')}
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${activeMenu === 'subtitles' ? 'bg-white/20' : 'hover:bg-white/10'} ${currentSubtitle !== -1 ? 'text-white' : ''}`}
                title="Subtitles"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z" /></svg>
              </button>
              {activeMenu === 'subtitles' && !showSubtitleSettings && (
                <GlassMenu>
                  <MenuLabel>Subtitles</MenuLabel>
                  <MenuItem active={currentSubtitle === -1} onClick={() => changeSubtitle(-1)}>Off</MenuItem>
                  {hlsSubtitles.map((sub, i) => (
                    <MenuItem key={`hls-${i}`} active={currentSubtitle === i} onClick={() => changeSubtitle(i)}>
                      {sub.name || sub.lang || `Track ${i + 1}`}
                    </MenuItem>
                  ))}
                  {(subtitleTracks || []).map((sub, i) => {
                    const idx = hlsSubtitles.length + i;
                    return (
                      <MenuItem key={`ext-${i}`} active={currentSubtitle === idx} onClick={() => changeSubtitle(idx)}>
                        {sub.label || sub.lang || `External ${i + 1}`}
                      </MenuItem>
                    );
                  })}
                  {/* Subtitle settings — closes the subtitles menu + opens the
                      standalone settings panel (avoids 2 panels at once) */}
                  <div className="border-t border-white/10 mt-1 pt-1">
                    <button
                      onClick={() => {
                        setActiveMenu(null);
                        setShowSubtitleSettings(true);
                      }}
                      className="block w-full text-left px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-all flex items-center gap-2"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14v3h-1V6h-5v12h2v1H9v-1h2V6H6v1H5V4z M3 18h6v1H3z M15 18h6v1h-6z M9 18h6v1H9z" /></svg>
                      Subtitle settings
                    </button>
                  </div>
                </GlassMenu>
              )}
            </div>
          )}

          {/* ═══ Subtitle Settings gear — hidden on mobile to save space ═══ */}
          <div className="relative hidden sm:block">
            <button
              onClick={() => {
                setShowSubtitleSettings(s => !s);
                setActiveMenu(null);
              }}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${showSubtitleSettings ? 'bg-white/20' : 'hover:bg-white/10'}`}
              title="Subtitle settings"
            >
              {/* "Aa" text icon — subtitle customization, not a gear */}
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14v3h-1V6h-5v12h2v1H9v-1h2V6H6v1H5V4z M3 18h6v1H3z M15 18h6v1h-6z M9 18h6v1H9z" /></svg>
            </button>
            {showSubtitleSettings && (
              <SubtitleSettingsPanel
                settings={subtitleSettings}
                onUpdate={updateSubtitleSettings}
                onReset={resetSubtitleSettings}
                onClose={() => setShowSubtitleSettings(false)}
              />
            )}
          </div>

          {/* Stream health indicator — hidden on mobile (user request: remove wifi icon) */}
          <div className="relative hidden sm:block">
            <button
              onClick={() => { setShowStreamInfo(!showStreamInfo); setActiveMenu(null); }}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${showStreamInfo ? 'bg-white/20' : 'hover:bg-white/10'}`}
              title="Stream health"
            >
              {streamHealth === 'good' && (
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21l3.6-4.5c-1-.8-2.3-1.3-3.6-1.3s-2.6.5-3.6 1.3L12 21zm0-15c-3.6 0-6.9 1.2-9.5 3.3l1.5 1.9C6.2 9.5 8.9 8.5 12 8.5s5.8 1 8 2.7l1.5-1.9C18.9 7.2 15.6 6 12 6zm0 5c-2.1 0-4 .7-5.5 1.9l1.5 1.9C9.1 13.9 10.5 13.5 12 13.5s2.9.4 4 1.3l1.5-1.9C16 11.7 14.1 11 12 11z" /></svg>
              )}
              {streamHealth === 'fair' && (
                <svg className="w-4 h-4 text-white/70" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21l3.6-4.5c-1-.8-2.3-1.3-3.6-1.3s-2.6.5-3.6 1.3L12 21zm0-10c-2.1 0-4 .7-5.5 1.9l1.5 1.9C9.1 13.9 10.5 13.5 12 13.5s2.9.4 4 1.3l1.5-1.9C16 11.7 14.1 11 12 11z" /></svg>
              )}
              {streamHealth === 'poor' && (
                <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21l3.6-4.5c-1-.8-2.3-1.3-3.6-1.3s-2.6.5-3.6 1.3L12 21z" /></svg>
              )}
              {streamHealth === 'unknown' && (
                <svg className="w-4 h-4 text-white/30" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21l3.6-4.5c-1-.8-2.3-1.3-3.6-1.3s-2.6.5-3.6 1.3L12 21zm0-15c-3.6 0-6.9 1.2-9.5 3.3l1.5 1.9C6.2 9.5 8.9 8.5 12 8.5s5.8 1 8 2.7l1.5-1.9C18.9 7.2 15.6 6 12 6z" /></svg>
              )}
            </button>
            {showStreamInfo && (
              <GlassMenu>
                <MenuLabel>Stream Health</MenuLabel>
                <div className="px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] text-white/50 uppercase">Status</span>
                    <span className={`text-xs font-bold ${streamHealth === 'good' ? 'text-white' : streamHealth === 'fair' ? 'text-white/70' : 'text-white/50'}`}>
                      {streamHealth === 'good' ? 'Excellent' : streamHealth === 'fair' ? 'Fair' : streamHealth === 'poor' ? 'Poor' : 'Connecting...'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] text-white/50 uppercase">Quality</span>
                    <span className="text-xs font-bold text-white">
                      {currentQuality === -1 ? 'Auto' : qualities[currentQuality]?.height + 'p' || 'Auto'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] text-white/50 uppercase">Buffer</span>
                    <span className="text-xs font-bold text-white">{Math.round(bufferedProgress)}%</span>
                  </div>
                </div>
              </GlassMenu>
            )}
          </div>

          {/* Screenshot — hidden on mobile to save space */}
          <button
            onClick={takeScreenshot}
            className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 hidden sm:flex"
            title="Screenshot (S)"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9 4v3h6V4h2v3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3V4h2zm11 6H4v8h16v-8zm-5 1l2.5 3.5L19 14l1.5 2h-9L9 13l2.5 2z" /></svg>
          </button>

          {/* Download — hidden on mobile to save space for fullscreen */}
          <button
            onClick={() => setShowDownloadModal(true)}
            className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 hidden sm:flex"
            title="Download"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V5a3 3 0 0 0-6 0v4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 6v3h-2v-3H8l4-4 4 4h-3z" /></svg>
          </button>

          {/* Fullscreen (always visible, slightly smaller on mobile) */}
          <button
            onClick={toggleFullscreen}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full hover:bg-white/10 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
            title="Fullscreen (F)"
          >
            {fullscreen ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
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
          const titleRes = await fetch('https://graphql.anilist.co', {
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
        className="bg-black border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V5a3 3 0 0 0-6 0v4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 6v3h-2v-3H8l4-4 4 4h-3z" /></svg>
            <h3 className="text-sm font-bold text-white">Download</h3>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <span className="ml-2.5 text-xs text-white/50">Finding links...</span>
            </div>
          )}

          {error && !loading && (
            <div className="text-center py-6">
              <p className="text-xs text-white/40 mb-3">{error}</p>
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
                    className="block px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/15 transition-all group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-white/10 transition-colors">
                        <svg className="w-3 h-3 text-white/50" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V5a3 3 0 0 0-6 0v4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 6v3h-2v-3H8l4-4 4 4h-3z" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-white/80 truncate">
                          {link.text.split('|').pop()?.trim() || link.text}
                        </p>
                        <p className="text-[9px] text-white/30 truncate">{link.decodedUrl}</p>
                      </div>
                      <svg className="w-3 h-3 text-white/30 group-hover:text-white/60 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                  </a>
                ))}
              </div>

              {/* "Want to explore downloads?" link at bottom */}
              <div className="mt-3 pt-3 border-t border-white/8 text-center">
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
    <div className="absolute bottom-full right-0 mb-3 bg-black/60 backdrop-blur-2xl border border-white/15 rounded-2xl overflow-hidden min-w-[140px] py-1.5 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
      {children}
    </div>
  );
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1 text-[10px] font-bold text-white/40 uppercase tracking-wider">{children}</div>
  );
}

function MenuItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-all duration-150 ${active ? 'text-white font-bold' : 'text-white/60'}`}
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
