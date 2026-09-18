"use client";

import { useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";
import { proxifyM3u8 } from "@/lib/proxy";

// ============================================================
// HLS PLAYER — FAST LIVE STREAM
//
// Routes m3u8 through Cloudflare Worker (NEXT_PUBLIC_PROXY_BASE).
// The worker rewrites segment URLs to /p/{token} (relative) so
// all segments go through the same proxy automatically.
//
// Key speed optimizations:
//   - Worker edge: 300+ POPs, no Vercel CPU time limits
//   - startLevel: 0 (skip ABR quality probing)
//   - initialLiveManifestSize: 1 (play after 1 segment, not 3)
//   - abrEwmaDefaultEstimate: 5Mbps (start high, not low)
//   - progressive: true (play while downloading)
// ============================================================

interface HLSPlayerProps {
  src: string;
  autoPlay?: boolean;
  muted?: boolean;
  onError?: (error: string) => void;
  onPlaying?: () => void;
  className?: string;
}

export default function HLSPlayer({
  src,
  autoPlay = true,
  muted = true,
  onError,
  onPlaying,
  className = "",
}: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryCountRef = useRef(0);

  const handleError = useCallback(
    (error: string) => {
      onError?.(error);
    },
    [onError]
  );
  const handlePlaying = useCallback(() => {
    onPlaying?.();
  }, [onPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    retryCountRef.current = 0;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Safari/iOS — native HLS
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      const resolveUrl = proxifyM3u8(src);
      video.src = resolveUrl;
      const onPlay = () => handlePlaying();
      const onError = () => handleError("Native HLS failed");
      video.addEventListener("playing", onPlay);
      video.addEventListener("error", onError);
      if (autoPlay) video.play().catch(() => {});
      return () => {
        video.removeEventListener("playing", onPlay);
        video.removeEventListener("error", onError);
      };
    }

    // Chrome/Firefox — hls.js
    if (!Hls.isSupported()) {
      handleError("HLS not supported");
      return;
    }

    const hls = new Hls({
      // === LIVE STREAM SETTINGS ===
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 6,
      liveDurationInfinity: true,
      liveBackBufferLength: 0,
      backBufferLength: 0,

      // === SPEED: Buffer settings for fast start ===
      maxBufferLength: 5,              // Only 5s buffer (was 10)
      maxMaxBufferLength: 15,          // Max 15s (was 30)
      maxBufferSize: 30 * 1000 * 1000,
      maxBufferHole: 0.5,

      // === SPEED: Start playing ASAP ===
      startLevel: 0,                   // Use first quality level immediately (no ABR probing)
      initialLiveManifestSize: 1,      // Play after just 1 segment (was 3!)
      abrEwmaDefaultEstimate: 5000000, // 5Mbps estimate (was 500Kbps — way too low)

      // === PLAYLIST REFRESH ===
      manifestLoadingMaxRetry: 20,
      manifestLoadingRetryDelay: 500,
      manifestLoadingTimeOut: 15000,
      levelLoadingMaxRetry: 20,
      levelLoadingRetryDelay: 500,
      levelLoadingTimeOut: 15000,

      // === SEGMENT LOADING ===
      fragLoadingMaxRetry: 10,
      fragLoadingRetryDelay: 1000,
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetryTimeout: 4000,

      // === PERFORMANCE ===
      enableWorker: true,
      lowLatencyMode: false,
      progressive: true,
    });

    hlsRef.current = hls;

    const resolveUrl = proxifyM3u8(src);
    hls.loadSource(resolveUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
      if (autoPlay) {
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
      }
    });

    hls.on(Hls.Events.FRAG_BUFFERED, () => {
      // Reset retry counter on successful playback (don't call handlePlaying here —
      // it fires on every fragment; the video 'playing' event below is sufficient)
      retryCountRef.current = 0;
    });

    // Add and properly track the playing event listener
    const onPlayingEvent = () => handlePlaying();
    video.addEventListener("playing", onPlayingEvent);

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          // CDN rate-limits cause intermittent 403s on fragments.
          // Retry aggressively (6 attempts with backoff) before giving up.
          if (retryCountRef.current < 6) {
            retryCountRef.current++;
            const delay = Math.min(1000 * Math.pow(1.5, retryCountRef.current), 5000);
            console.warn(`[HLS] Fatal network error (retry ${retryCountRef.current}/6 in ${delay}ms): ${data.details}`);
            setTimeout(() => hls.startLoad(), delay);
          } else {
            console.error(`[HLS] Stream failed after 6 retries — triggering server fallback`);
            handleError("Stream failed after retries. Try another server.");
            hls.destroy();
            hlsRef.current = null;
          }
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          handleError(`Fatal: ${data.details}`);
          hls.destroy();
          hlsRef.current = null;
        }
      }
    });

    return () => {
      hls.destroy();
      hlsRef.current = null;
      video.removeEventListener("playing", onPlayingEvent);
    };
  }, [src, autoPlay, handlePlaying, handleError]);

  return (
    <video
      ref={videoRef}
      className={`w-full h-full object-contain bg-black ${className}`}
      playsInline
      muted={muted}
      autoPlay={autoPlay}
      controls
    />
  );
}
