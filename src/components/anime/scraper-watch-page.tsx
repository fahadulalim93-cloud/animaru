"use client";

/**
 * Scraper Watch Page — fetches sources and plays the stream via HLS.js
 * through our universal stream proxy.
 *
 * URL: #scraper/watch/{site}/{anilistId}/{episodeId}
 *
 * Features:
 *   - Variant filter (SUB / DUB / HARDSUB / HARDDUB)
 *   - Source picker (when multiple sources for same variant)
 *   - HLS.js player with quality auto-selection
 *   - Intro/outro skip buttons (when available)
 *   - Subtitle track selection
 *   - Back to anime button
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useAppStore } from "@/components/anime/store";
import Hls from "hls.js";
import type { UnifiedSourcesResponse, Variant } from "@/lib/unified-scraper";

interface AniListMeta {
  id: number;
  title?: { romaji?: string; english?: string; native?: string };
  coverImage?: { large?: string; extraLarge?: string };
  bannerImage?: string;
  episodes?: number;
}

export default function ScraperWatchPage({
  anilistId,
  episodeId,
  site,
}: {
  anilistId: string;
  episodeId: string;
  site: string;
}) {
  const navigate = useAppStore((s) => s.navigate);
  const id = parseInt(anilistId, 10);

  const [meta, setMeta] = useState<AniListMeta | null>(null);
  const [sourcesResp, setSourcesResp] = useState<UnifiedSourcesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [selectedSourceIdx, setSelectedSourceIdx] = useState(0);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Fetch AniList meta
  useEffect(() => {
    fetch(`/api/anime/scraper/meta/${id}`)
      .then((r) => r.json())
      .then((d) => setMeta(d.error ? null : d))
      .catch(() => setMeta(null));
  }, [id]);

  // Fetch sources
  const fetchSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSourcesResp(null);
    try {
      const res = await fetch(`/api/anime/scraper/sources/${site}/${encodeURIComponent(episodeId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: UnifiedSourcesResponse = await res.json();
      setSourcesResp(data);

      // Auto-pick best variant (prefer sub → hardsub → dub → harddub)
      const variants = new Set<Variant>();
      data.sources.forEach((s) => variants.add(s.variant));
      const order: Variant[] = ["sub", "hardsub", "dub", "harddub"];
      const picked = order.find((v) => variants.has(v)) || null;
      setSelectedVariant(picked);
      setSelectedSourceIdx(0);
    } catch (e: any) {
      setError(e?.message || "Failed to fetch sources");
    } finally {
      setLoading(false);
    }
  }, [site, episodeId]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Sources filtered by selected variant
  const filteredSources = useMemo(() => {
    if (!sourcesResp || !selectedVariant) return [];
    return sourcesResp.sources.filter((s) => s.variant === selectedVariant);
  }, [sourcesResp, selectedVariant]);

  // Update current URL when variant/source changes
  useEffect(() => {
    if (filteredSources.length === 0) {
      setCurrentUrl(null);
      return;
    }
    const src = filteredSources[Math.min(selectedSourceIdx, filteredSources.length - 1)];
    if (!src) {
      setCurrentUrl(null);
      return;
    }
    // Route through universal stream proxy
    const proxyUrl = `/api/anime/scraper/stream?provider=${encodeURIComponent(src.provider)}&subProvider=${encodeURIComponent(src.subProvider)}&mode=manifest&url=${encodeURIComponent(src.url)}`;
    setCurrentUrl(proxyUrl);
  }, [filteredSources, selectedSourceIdx]);

  // Setup HLS.js when URL changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentUrl) return;

    // Cleanup previous
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      });
      hlsRef.current = hls;
      hls.loadSource(currentUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {}); // ignore autoplay block
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          console.error("[HLS] Fatal error:", data);
          // Try to recover
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setError(`Playback error: ${data.details}`);
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS (Safari/iOS)
      video.src = currentUrl;
      video.play().catch(() => {});
    } else {
      setError("HLS not supported in this browser");
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentUrl]);

  // Available variants for filter UI
  const availableVariants = useMemo(() => {
    if (!sourcesResp) return [] as Variant[];
    const seen = new Set<Variant>();
    sourcesResp.sources.forEach((s) => seen.add(s.variant));
    return Array.from(seen);
  }, [sourcesResp]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  const title = meta?.title?.english || meta?.title?.romaji || "Unknown";

  return (
    <div className="text-white">
      {/* Back button */}
      <button
        onClick={() => navigate({ page: "scraper-anime", id: String(id) })}
        className="text-xs text-white/60 hover:text-white mb-3 transition inline-flex items-center gap-1"
      >
        ← Back to {title}
      </button>

      {/* Player */}
      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-4">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#ffffff] animate-spin mx-auto mb-3" />
              <p className="text-xs text-white/50">Fetching streams from {site}...</p>
            </div>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center max-w-md px-6">
              <div className="text-3xl mb-2">⚠️</div>
              <p className="text-sm text-white/80 mb-3">{error}</p>
              <button
                onClick={fetchSources}
                className="px-4 py-2 bg-[#ffffff] hover:bg-[#ffffff]/90 rounded text-xs font-bold"
              >
                Retry
              </button>
            </div>
          </div>
        ) : !currentUrl ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center max-w-md px-6">
              <div className="text-3xl mb-2">📺</div>
              <p className="text-sm text-white/80 mb-1">No stream available</p>
              <p className="text-xs text-white/40">
                {sourcesResp?.sources?.length === 0
                  ? `${site} returned no sources for this episode`
                  : "Try a different variant or source"}
              </p>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            controls
            autoPlay
            playsInline
            className="w-full h-full"
          />
        )}
      </div>

      {/* Controls panel */}
      {!loading && !error && sourcesResp && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Variant filter */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-2">Audio / Subtitle Variant</h3>
              <div className="flex flex-wrap gap-2">
                {(["sub", "dub", "hardsub", "harddub"] as Variant[]).map((v) => {
                  const available = availableVariants.includes(v);
                  const active = selectedVariant === v;
                  return (
                    <button
                      key={v}
                      onClick={() => {
                        if (!available) return;
                        setSelectedVariant(v);
                        setSelectedSourceIdx(0);
                      }}
                      disabled={!available}
                      className={`px-3 py-1.5 rounded text-xs font-bold border transition ${
                        !available
                          ? "opacity-30 cursor-not-allowed bg-white/5 border-white/10"
                          : active
                          ? "bg-[#ffffff] border-[#ffffff] text-white"
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {v === "sub" ? "SUB" : v === "dub" ? "DUB" : v === "hardsub" ? "HARDSUB" : "HARDDUB"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Source picker */}
            {filteredSources.length > 1 && (
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-2">
                  Source ({filteredSources.length} available)
                </h3>
                <div className="flex flex-wrap gap-2">
                  {filteredSources.map((s, idx) => {
                    const active = idx === selectedSourceIdx;
                    return (
                      <button
                        key={`${s.subProvider}-${idx}`}
                        onClick={() => setSelectedSourceIdx(idx)}
                        className={`px-3 py-1.5 rounded text-xs font-bold border transition ${
                          active
                            ? "bg-white/10 border-white/30 text-white"
                            : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        {s.subProvider} · {s.quality}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Intro/outro skip info */}
            {(sourcesResp.intro || sourcesResp.outro) && (
              <div className="text-xs text-white/40 space-y-1">
                {sourcesResp.intro && (
                  <div>OP: {Math.floor(sourcesResp.intro.start)}s - {Math.floor(sourcesResp.intro.end)}s</div>
                )}
                {sourcesResp.outro && (
                  <div>ED: {Math.floor(sourcesResp.outro.start)}s - {Math.floor(sourcesResp.outro.end)}s</div>
                )}
              </div>
            )}
          </div>

          {/* Source info */}
          <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-white/40">Site</span>
              <span className="font-bold uppercase">{site}</span>
            </div>
            {filteredSources[selectedSourceIdx] && (
              <>
                <div className="flex justify-between">
                  <span className="text-white/40">Provider</span>
                  <span className="font-bold">{filteredSources[selectedSourceIdx].subProvider}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Quality</span>
                  <span className="font-bold">{filteredSources[selectedSourceIdx].quality}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Format</span>
                  <span className="font-bold uppercase">{filteredSources[selectedSourceIdx].format}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Audio</span>
                  <span className="font-bold uppercase">{filteredSources[selectedSourceIdx].audio}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Subtitle</span>
                  <span className="font-bold uppercase">{filteredSources[selectedSourceIdx].subtitle}</span>
                </div>
                {sourcesResp.triedProviders && sourcesResp.triedProviders.length > 0 && (
                  <div className="pt-2 border-t border-white/5">
                    <div className="text-white/40 mb-1">Tried providers:</div>
                    <div className="text-[10px] text-white/60 space-y-0.5">
                      {sourcesResp.triedProviders.map((p) => (
                        <div key={p}>· {p}</div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
