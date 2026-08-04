"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";

// ============================================================
// MOVIE/TV PLAYER — direct MP4 + HLS playback
//
// Replaces the old embed-iframe player on movie-watch.tsx and
// tv-watch.tsx. Streams come from Vidlink (direct MP4 + SRT) and
// fall back to Moviebox (MP4 / HLS).
//
// Features:
//   - <video> element (NOT an iframe)
//   - Quality selector (1080p / 720p / 480p / 360p)
//   - Subtitle track selector (SRT → VTT via stream proxy)
//   - HLS playback via hls.js for .m3u8 streams (Safari uses native)
//   - Dark theme matching existing player styling (bg-black)
// ============================================================

export interface PlayerSource {
  url: string; // direct MP4 or M3U8 URL
  proxyUrl: string; // wrapped through /api/stream
  quality: string;
  format: string;
}

export interface PlayerSubtitle {
  url: string;
  proxyUrl: string;
  lang: string;
  label: string;
}

interface MovieTvPlayerProps {
  sources: PlayerSource[];
  subtitles: PlayerSubtitle[];
  poster?: string;
  accentColor?: string; // hex like "#1e88ff" or "#34D399"
  onError?: (msg: string) => void;
}

const GROTESK = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

export default function MovieTvPlayer({
  sources,
  subtitles,
  poster,
  accentColor = "#1e88ff",
  onError,
}: MovieTvPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryCountRef = useRef(0);

  // Pick the highest-quality source by default (1080p > 720p > 480p > 360p).
  const pickDefaultSourceIdx = useCallback((list: PlayerSource[]) => {
    if (list.length === 0) return -1;
    const rank = (q: string) => {
      const m = /(\d{3,4})p?/.exec(q);
      return m ? parseInt(m[1], 10) : 0;
    };
    let best = 0;
    for (let i = 1; i < list.length; i++) {
      if (rank(list[i].quality) > rank(list[best].quality) || rank(list[best].quality) === 0) {
        best = i;
      }
    }
    return best;
  }, []);

  const [activeSourceIdx, setActiveSourceIdx] = useState<number>(() => pickDefaultSourceIdx(sources));
  const [activeSubIdx, setActiveSubIdx] = useState<number>(-1); // -1 = off
  const [loading, setLoading] = useState(true);
  const [playerError, setPlayerError] = useState<string>("");

  // Reset selection whenever the source list changes (new stream fetch).
  useEffect(() => {
    setActiveSourceIdx(pickDefaultSourceIdx(sources));
  }, [sources, pickDefaultSourceIdx]);

  // Re-init the player when the active source changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || activeSourceIdx < 0 || !sources[activeSourceIdx]) {
      setLoading(false);
      return;
    }

    const src = sources[activeSourceIdx];
    const playUrl = src.proxyUrl || src.url;
    const isHls = src.format === "hls" || playUrl.includes(".m3u8");

    // Cleanup any previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setLoading(true);
    setPlayerError("");

    let cancelled = false;

    const handleError = (msg: string) => {
      if (cancelled) return;
      setPlayerError(msg);
      setLoading(false);
      onError?.(msg);
    };

    if (!isHls) {
      // Direct MP4 — set src and play
      video.src = playUrl;
      video.load();
      const onLoaded = () => {
        if (cancelled) return;
        setLoading(false);
        video.play().catch(() => {});
      };
      const onErr = () => handleError("Stream failed to load — try another quality");
      video.addEventListener("loadeddata", onLoaded);
      video.addEventListener("error", onErr);
      return () => {
        cancelled = true;
        video.removeEventListener("loadeddata", onLoaded);
        video.removeEventListener("error", onErr);
        video.removeAttribute("src");
        video.load();
      };
    }

    // HLS playback
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari/iOS — native HLS
      video.src = playUrl;
      video.load();
      const onLoaded = () => {
        if (cancelled) return;
        setLoading(false);
        video.play().catch(() => {});
      };
      const onErr = () => handleError("HLS stream failed — try another quality");
      video.addEventListener("loadeddata", onLoaded);
      video.addEventListener("error", onErr);
      return () => {
        cancelled = true;
        video.removeEventListener("loadeddata", onLoaded);
        video.removeEventListener("error", onErr);
        video.removeAttribute("src");
        video.load();
      };
    }

    if (!Hls.isSupported()) {
      handleError("HLS not supported in this browser");
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 30,
      maxBufferLength: 30,
    });
    hlsRef.current = hls;
    retryCountRef.current = 0;
    hls.loadSource(playUrl);
    hls.attachMedia(video);

    const onManifest = () => {
      if (cancelled) return;
      setLoading(false);
      retryCountRef.current = 0;
      video.play().catch(() => {});
    };
    const onErr = (_e: unknown, data: { fatal: boolean; type: string; details: string }) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (retryCountRef.current < 3) {
              retryCountRef.current++;
              setTimeout(() => hls.startLoad(), 2000);
            } else {
              handleError(`HLS error: ${data.details}`);
              hls.destroy();
              hlsRef.current = null;
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            handleError(`HLS error: ${data.details}`);
            hls.destroy();
            hlsRef.current = null;
            break;
        }
      }
    };
    hls.on(Hls.Events.MANIFEST_PARSED, onManifest);
    hls.on(Hls.Events.ERROR, onErr);

    return () => {
      cancelled = true;
      hls.off(Hls.Events.MANIFEST_PARSED, onManifest);
      hls.off(Hls.Events.ERROR, onErr);
      hls.destroy();
      hlsRef.current = null;
    };
  }, [activeSourceIdx, sources, onError]);

  const selectSubtitle = useCallback((idx: number) => {
    setActiveSubIdx(idx);
    const video = videoRef.current;
    if (!video) return;
    // Toggle textTracks
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = i === idx ? "showing" : "disabled";
    }
  }, []);

  // ─── Loading overlay ───
  const showLoading = loading && !playerError && activeSourceIdx >= 0;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* The video element — uses native controls for simplicity */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full bg-black"
        controls
        playsInline
        poster={poster}
        crossOrigin="anonymous"
      >
        {subtitles.map((sub, idx) => (
          <track
            key={`${sub.url}-${idx}`}
            kind="subtitles"
            src={sub.proxyUrl || sub.url}
            srcLang={sub.lang}
            label={sub.label}
            default={idx === activeSubIdx}
          />
        ))}
      </video>

      {/* ─── Loading overlay ─── */}
      {showLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: accentColor, borderTopColor: "transparent" }}
            />
            <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-white/70" style={{ fontFamily: GROTESK }}>
              Loading stream…
            </span>
          </div>
        </div>
      )}

      {/* ─── Error overlay ─── */}
      {playerError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-4">
          <div className="text-center space-y-3 max-w-sm">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto border"
              style={{ borderColor: `${accentColor}40`, background: `${accentColor}15` }}
            >
              <svg className="w-6 h-6" style={{ color: accentColor }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </div>
            <p className="text-[13px] text-white/80">{playerError}</p>
            <p className="text-[11px] text-white/40">Try a different quality or fallback source below.</p>
          </div>
        </div>
      )}

      {/* ─── Quality + subtitle selector ─── */}
      {sources.length > 0 && (
        <div className="absolute bottom-3 right-3 z-10 flex gap-2">
          {/* Quality selector */}
          <div className="relative group">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-extrabold uppercase tracking-[0.18em] text-white bg-black/65 backdrop-blur-md border border-white/15 hover:bg-black/85 transition-colors"
              style={{ fontFamily: GROTESK }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              {activeSourceIdx >= 0 && sources[activeSourceIdx] ? sources[activeSourceIdx].quality : "Quality"}
            </button>
            <div className="absolute bottom-full right-0 mb-1.5 min-w-[120px] rounded-lg bg-[#0a0d13]/95 backdrop-blur-md border border-white/[0.08] p-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity shadow-2xl">
              {sources.map((s, idx) => (
                <button
                  key={`q-${idx}`}
                  type="button"
                  onClick={() => setActiveSourceIdx(idx)}
                  className={`w-full text-left px-3 py-1.5 rounded-md text-[12px] font-bold transition-colors ${
                    idx === activeSourceIdx ? "text-white" : "text-[#a1a7b3] hover:text-white hover:bg-white/[0.06]"
                  }`}
                  style={{ fontFamily: GROTESK, background: idx === activeSourceIdx ? `${accentColor}25` : undefined }}
                >
                  {s.quality}
                  <span className="ml-1.5 text-[9px] uppercase opacity-60">{s.format}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Subtitle selector */}
          {subtitles.length > 0 && (
            <div className="relative group">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-extrabold uppercase tracking-[0.18em] text-white bg-black/65 backdrop-blur-md border border-white/15 hover:bg-black/85 transition-colors"
                style={{ fontFamily: GROTESK, color: activeSubIdx >= 0 ? accentColor : undefined }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M7 13h2M14 13h3M7 10h2M11 10h3" />
                </svg>
                {activeSubIdx >= 0 ? "CC ON" : "CC"}
              </button>
              <div className="absolute bottom-full right-0 mb-1.5 min-w-[160px] max-h-60 overflow-y-auto rounded-lg bg-[#0a0d13]/95 backdrop-blur-md border border-white/[0.08] p-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity shadow-2xl">
                <button
                  type="button"
                  onClick={() => selectSubtitle(-1)}
                  className={`w-full text-left px-3 py-1.5 rounded-md text-[12px] font-bold transition-colors ${
                    -1 === activeSubIdx ? "text-white" : "text-[#a1a7b3] hover:text-white hover:bg-white/[0.06]"
                  }`}
                  style={{ fontFamily: GROTESK, background: -1 === activeSubIdx ? `${accentColor}25` : undefined }}
                >
                  Off
                </button>
                {subtitles.map((sub, idx) => (
                  <button
                    key={`sub-${idx}`}
                    type="button"
                    onClick={() => selectSubtitle(idx)}
                    className={`w-full text-left px-3 py-1.5 rounded-md text-[12px] font-bold transition-colors ${
                      idx === activeSubIdx ? "text-white" : "text-[#a1a7b3] hover:text-white hover:bg-white/[0.06]"
                    }`}
                    style={{ fontFamily: GROTESK, background: idx === activeSubIdx ? `${accentColor}25` : undefined }}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
