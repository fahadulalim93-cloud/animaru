"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "./store";
import MovieTvPlayer, {
  type PlayerSource,
  type PlayerSubtitle,
} from "./movie-tv-player";

interface TVShowInfo {
  id: number;
  name: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  first_air_date?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  vote_average?: number;
  genres?: Array<{ id: number; name: string }>;
}

interface SeasonEpisodes {
  episodes: Array<{
    id: number;
    name: string;
    overview?: string;
    episode_number: number;
    season_number: number;
    still_path?: string;
    air_date?: string;
    runtime?: number;
    vote_average?: number;
  }>;
}

const GROTESK = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const ACCENT = "#34D399";

type SourceOrigin = "vidlink" | "moviebox" | null;

interface StreamState {
  origin: SourceOrigin;
  sources: PlayerSource[];
  subtitles: PlayerSubtitle[];
  hls: PlayerSource[];
  error: string;
  loading: boolean;
}

const EMPTY_STREAM: StreamState = {
  origin: null,
  sources: [],
  subtitles: [],
  hls: [],
  error: "",
  loading: true,
};

export default function TVWatchPage({ tvId, season: initialSeason, episode: initialEpisode }: { tvId: number; season: number; episode: number }) {
  const navigate = useAppStore(s => s.navigate);
  const recordMediaProgress = useAppStore(s => s.recordMediaProgress);
  const [show, setShow] = useState<TVShowInfo | null>(null);
  const [episodes, setEpisodes] = useState<SeasonEpisodes | null>(null);
  const [currentSeason, setCurrentSeason] = useState(initialSeason);
  const [currentEpisode, setCurrentEpisode] = useState(initialEpisode);
  const [stream, setStream] = useState<StreamState>(EMPTY_STREAM);
  const [activeTab, setActiveTab] = useState<"mp4" | "hls">("mp4");
  const episodeRailRef = useRef<HTMLDivElement>(null);
  const lastFetchKeyRef = useRef<string>("");

  // ── Load show metadata ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/tmdb/detail?id=${tvId}&type=tv`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setShow(data);
        }
      } catch { /* ignore */ }
    }
    load();
    return () => { cancelled = true; };
  }, [tvId]);

  // ── Sync: record for the profile "Continue" + XP (per season/episode) ──
  useEffect(() => {
    if (!show) return;
    recordMediaProgress({
      kind: "tv",
      mediaId: String(tvId),
      title: show.name || "TV Show",
      cover: show.poster_path ? `https://image.tmdb.org/t/p/w342${show.poster_path}` : "",
      unitLabel: `S${currentSeason}·E${currentEpisode}`,
      percent: 100,
      resume: { page: "tv-watch", id: tvId, season: currentSeason, episode: currentEpisode },
    }, 10);
  }, [show, tvId, currentSeason, currentEpisode, recordMediaProgress]);

  // ── Load season episodes ──
  useEffect(() => {
    let cancelled = false;
    async function loadSeason() {
      try {
        const res = await fetch(`/api/tmdb/season?tvId=${tvId}&season=${currentSeason}`);
        if (res.ok && !cancelled) setEpisodes(await res.json());
      } catch { /* ignore */ }
    }
    loadSeason();
    return () => { cancelled = true; };
  }, [tvId, currentSeason]);

  // ── Fetch streams (Vidlink — primary and only source) ──
  // Moviebox stream API (netfilm.world) returns 403 "invalid region" from
  // our server, so Vidlink is the only working source.
  const loadStreams = useCallback(async (_title: string, season: number, episode: number) => {
    const fetchKey = `tv:${tvId}:${season}:${episode}`;
    if (lastFetchKeyRef.current === fetchKey) return;
    lastFetchKeyRef.current = fetchKey;

    setStream({ ...EMPTY_STREAM, loading: true });

    try {
      const res = await fetch(
        `/api/stream/vidlink?tmdbId=${tvId}&type=tv&season=${season}&episode=${episode}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
          // Filter out DASH sources — our player only supports MP4 and HLS
          const playableSources = data.sources.filter((s: PlayerSource) =>
            s.format !== "dash" && !s.url.includes(".mpd")
          );
          if (playableSources.length > 0) {
            setStream({
              origin: "vidlink",
              sources: playableSources,
              subtitles: data.subtitles || [],
              hls: [],
              error: "",
              loading: false,
            });
            return;
          }
        }
      }
    } catch { /* fall through to error */ }

    setStream({
      origin: null,
      sources: [],
      subtitles: [],
      hls: [],
      error: "No streams available — Vidlink failed.",
      loading: false,
    });
  }, [tvId]);

  // When show name + season/episode is set, fetch streams.
  useEffect(() => {
    if (!show?.name) return;
    loadStreams(show.name, currentSeason, currentEpisode);
  }, [show, currentSeason, currentEpisode, loadStreams]);

  // Active sources (mp4 or hls)
  const activeSources: PlayerSource[] =
    activeTab === "hls" && stream.hls.length > 0 ? stream.hls : stream.sources;

  // Determine the poster URL for the video element.
  const posterUrl = show?.backdrop_path
    ? `https://image.tmdb.org/t/p/w780${show.backdrop_path}`
    : show?.poster_path
      ? `https://image.tmdb.org/t/p/w780${show.poster_path}`
      : undefined;

  const currentEp = episodes?.episodes?.find(e => e.episode_number === currentEpisode);
  const score = show?.vote_average != null ? (show.vote_average > 10 ? show.vote_average / 10 : show.vote_average) : 0;

  const goToEpisode = (season: number, episode: number) => {
    setCurrentSeason(season);
    setCurrentEpisode(episode);
    navigate({ page: "tv-watch", id: tvId, season, episode });
  };

  return (
    <div className="min-h-screen bg-[#050608] fade-in">
      {/* ═══ Top bar ═══ */}
      <div className="flex items-center gap-3 px-4 lg:px-8 h-14 border-b border-white/[0.05]">
        <button
          onClick={() => (show ? navigate({ page: "tv-detail", id: show.id }) : navigate({ page: "tv" }))}
          className="inline-flex items-center gap-2 text-[13px] font-bold text-[#a1a7b3] hover:text-white transition-colors"
          style={{ fontFamily: GROTESK }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
          Back
        </button>
        <span className="w-px h-4 bg-white/10" />
        <div className="min-w-0 flex items-center gap-2.5">
          <span className="ltv-tv-signal shrink-0"><i /><i /><i /></span>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#34D399] shrink-0" style={{ fontFamily: GROTESK }}>Live Feed</span>
          <h1 className="text-[13px] font-bold text-[#e8eaee] truncate" style={{ fontFamily: GROTESK }}>
            {show?.name || "Loading..."} <span className="text-[#5b616c] font-semibold">· S{currentSeason} E{currentEpisode}{currentEp ? ` — ${currentEp.name}` : ""}</span>
          </h1>
        </div>
        <button
          onClick={() => navigate({ page: "tv" })}
          className="ml-auto text-[12px] font-bold text-[#767d8a] hover:text-white transition-colors shrink-0"
          style={{ fontFamily: GROTESK }}
        >
          All TV Shows
        </button>
      </div>

      <div className="max-w-[1200px] mx-auto px-0 lg:px-8 pt-0 lg:pt-6 pb-16 space-y-4">
        {/* ═══ Player ═══ */}
        <div
          className="relative w-full aspect-video bg-black overflow-hidden lg:rounded-2xl border-y lg:border border-white/[0.07]"
          style={{ boxShadow: "0 24px 80px rgba(52,211,153,0.08)" }}
        >
          {stream.loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full border-2 border-[#34D399] border-t-transparent animate-spin" />
                <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-white/70" style={{ fontFamily: GROTESK }}>
                  Fetching direct streams…
                </span>
              </div>
            </div>
          ) : activeSources.length > 0 ? (
            <MovieTvPlayer
              sources={activeSources}
              subtitles={stream.subtitles}
              poster={posterUrl}
              accentColor={ACCENT}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-4">
              <div className="text-center space-y-3 max-w-md">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto border border-[#34D399]/30 bg-[#34D399]/10">
                  <svg className="w-7 h-7 text-[#34D399]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  </svg>
                </div>
                <p className="text-[#e8eaee] text-[14px] font-semibold" style={{ fontFamily: GROTESK }}>
                  {stream.error || "No direct streams available for this episode."}
                </p>
                <p className="text-[#767d8a] text-[12px]">
                  Source: <span className="font-bold text-[#a1a7b3]">{stream.origin || "none"}</span> — Vidlink + Moviebox fallback exhausted.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ═══ Quality deck (replaces the old channel list) ═══ */}
        <div className="mx-4 lg:mx-0 rounded-2xl bg-[#0a0d13] border border-white/[0.07] p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="ltv-tv-chbadge"><i />Quality</span>
            <span className="text-[11px] text-[#5b616c]">
              {stream.loading ? "Loading…" : stream.origin ? `Source: ${stream.origin}` : "No source"}
            </span>
          </div>
          {stream.hls.length > 0 && stream.sources.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setActiveTab("mp4")}
                className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors border ${
                  activeTab === "mp4"
                    ? "text-white border-transparent"
                    : "text-[#a1a7b3] border-white/[0.08] hover:text-white"
                }`}
                style={{ fontFamily: GROTESK, background: activeTab === "mp4" ? ACCENT : undefined }}
              >
                MP4 Direct
              </button>
              <button
                onClick={() => setActiveTab("hls")}
                className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors border ${
                  activeTab === "hls"
                    ? "text-white border-transparent"
                    : "text-[#a1a7b3] border-white/[0.08] hover:text-white"
                }`}
                style={{ fontFamily: GROTESK, background: activeTab === "hls" ? ACCENT : undefined }}
              >
                HLS Adaptive
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {!stream.loading && activeSources.length > 0 ? (
              activeSources.map((s, idx) => (
                <span
                  key={`q-${idx}`}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-[12px] font-bold border border-white/[0.08] bg-white/[0.02] text-[#c4c9d2]"
                  style={{ fontFamily: GROTESK }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                  {s.quality}
                  <span className="text-[9px] uppercase opacity-60 text-[#5b616c]">{s.format}</span>
                </span>
              ))
            ) : (
              <span className="text-[12px] text-[#5b616c] italic" style={{ fontFamily: GROTESK }}>
                {stream.loading ? "Fetching qualities…" : "No qualities available"}
              </span>
            )}
            {stream.subtitles.length > 0 && (
              <span className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold text-[#a1a7b3] border border-white/[0.08] bg-white/[0.02]" style={{ fontFamily: GROTESK }}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M7 13h2M14 13h3M7 10h2M11 10h3" />
                </svg>
                {stream.subtitles.length} subtitle{stream.subtitles.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* ═══ Episode rail — season selector + horizontal episode strip ═══ */}
        <div ref={episodeRailRef} className="mx-4 lg:mx-0 rounded-2xl bg-[#0a0d13] border border-white/[0.07] p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="ltv-tv-chbadge"><i />Up Next</span>
            {show?.number_of_seasons && show.number_of_seasons > 1 && (
              <select
                value={currentSeason}
                onChange={e => { const s = parseInt(e.target.value); setCurrentSeason(s); goToEpisode(s, 1); }}
                className="bg-[#10141c] text-[#c4c9d2] text-[12px] font-bold px-3.5 py-1.5 rounded-full border border-white/[0.1] outline-none focus:border-[#34D399]/40"
                style={{ fontFamily: GROTESK }}
              >
                {Array.from({ length: show.number_of_seasons }, (_, i) => (
                  <option key={i + 1} value={i + 1}>Season {i + 1}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto scroll-container pb-1">
            {episodes?.episodes ? episodes.episodes.map(ep => {
              const active = currentEpisode === ep.episode_number;
              return (
                <button
                  key={ep.id}
                  onClick={() => goToEpisode(ep.season_number, ep.episode_number)}
                  className={`shrink-0 w-[180px] text-left rounded-xl overflow-hidden border transition-all ${
                    active ? "border-[#34D399]/60" : "border-white/[0.07] hover:border-white/20"
                  }`}
                >
                  <div className="relative w-full aspect-video bg-[#10141c]">
                    {ep.still_path ? (
                      <img src={`https://image.tmdb.org/t/p/w300${ep.still_path}`} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-bold text-[#5b616c]">{ep.episode_number}</div>
                    )}
                    {active && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <svg className="w-6 h-6 text-[#34D399] animate-pulse" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <span className="text-[10px] font-extrabold" style={{ color: active ? "#34D399" : "#767d8a", fontFamily: GROTESK }}>EP {ep.episode_number}</span>
                    <p className={`text-[12px] font-semibold line-clamp-1 mt-0.5 ${active ? "text-white" : "text-[#c4c9d2]"}`}>{ep.name}</p>
                  </div>
                </button>
              );
            }) : (
              Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="shrink-0 w-[180px] space-y-2">
                  <div className="w-full aspect-video skeleton rounded-xl" />
                  <div className="h-3 w-24 skeleton rounded" />
                </div>
              ))
            )}
          </div>
        </div>

        {/* ═══ About panel ═══ */}
        {show && (
          <div className="mx-4 lg:mx-0 rounded-2xl bg-[#0a0d13] border border-white/[0.07] p-4 sm:p-6">
            <div className="flex gap-4 sm:gap-6">
              {show.poster_path && (
                <img
                  src={`https://image.tmdb.org/t/p/w342${show.poster_path}`}
                  alt={show.name}
                  className="w-24 sm:w-32 rounded-xl shrink-0 object-cover border border-white/[0.08] self-start"
                />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-2xl font-extrabold text-[#e8eaee] tracking-tight" style={{ fontFamily: GROTESK }}>{show.name}</h2>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {score > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold text-[#34D399] border border-[#34D399]/30 bg-[#34D399]/10">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                      {score.toFixed(1)}
                    </span>
                  )}
                  {show.number_of_seasons ? <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#a1a7b3] border border-white/10 bg-white/[0.04]">{show.number_of_seasons} Season{show.number_of_seasons > 1 ? "s" : ""}</span> : null}
                  {show.genres?.slice(0, 3).map(g => (
                    <span key={g.id} className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#c4c9d2] border border-white/[0.08]">{g.name}</span>
                  ))}
                </div>
                {show.overview && <p className="text-[13px] text-[#a1a7b3] leading-relaxed mt-3 line-clamp-4">{show.overview}</p>}
                <button
                  onClick={() => navigate({ page: "tv-detail", id: tvId })}
                  className="mt-3 text-[12px] font-bold text-[#34D399] hover:text-[#5eead4] transition-colors"
                  style={{ fontFamily: GROTESK }}
                >
                  View Full Details →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
