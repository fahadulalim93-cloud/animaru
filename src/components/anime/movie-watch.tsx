"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore, type TMDBContentItem } from "./store";
import MovieCard from "./movie-card";
import MovieTvPlayer, {
  type PlayerSource,
  type PlayerSubtitle,
} from "./movie-tv-player";

interface MovieInfo {
  id: number;
  title: string;
  original_title?: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  release_date?: string;
  runtime?: number;
  vote_average?: number;
  vote_count?: number;
  genres?: Array<{ id: number; name: string }>;
  tagline?: string;
  status?: string;
  production_companies?: Array<{ id: number; name: string; logo_path?: string }>;
  external_ids?: { imdb_id?: string };
  credits?: {
    cast: Array<{ id: number; name: string; character?: string; profile_path?: string; order?: number }>;
    crew?: Array<{ id: number; name: string; job?: string; department?: string; profile_path?: string }>;
  };
  similar?: { results: TMDBContentItem[] };
  recommendations?: { results: TMDBContentItem[] };
}

const GROTESK = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const ACCENT = "#1e88ff";

// Sources can come from either Vidlink (primary) or Moviebox (fallback).
type SourceOrigin = "vidlink" | "moviebox" | null;

interface StreamState {
  origin: SourceOrigin;
  sources: PlayerSource[];
  subtitles: PlayerSubtitle[];
  hls: PlayerSource[]; // for moviebox HLS entries
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

export default function MovieWatchPage({ movieId }: { movieId: number }) {
  const navigate = useAppStore(s => s.navigate);
  const recordMediaProgress = useAppStore(s => s.recordMediaProgress);
  const [movie, setMovie] = useState<MovieInfo | null>(null);
  const [stream, setStream] = useState<StreamState>(EMPTY_STREAM);
  const [activeTab, setActiveTab] = useState<"mp4" | "hls">("mp4");
  const lastFetchKeyRef = useRef<string>("");

  // ── Load movie metadata ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/tmdb/detail?id=${movieId}&type=movie`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setMovie(data);
          try {
            recordMediaProgress({
              kind: "movie",
              mediaId: String(movieId),
              title: data.title || data.original_title || "Movie",
              cover: data.poster_path ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : "",
              unitLabel: "Movie",
              percent: 100,
              resume: { page: "movie-watch", id: movieId },
            }, 15);
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }
    load();
    return () => { cancelled = true; };
  }, [movieId, recordMediaProgress]);

  // ── Fetch streams (Vidlink — primary and only source) ──
  // Moviebox stream API (netfilm.world) returns 403 "invalid region" from
  // our server, so Vidlink is the only working source.
  const loadStreams = useCallback(async (_title: string) => {
    const fetchKey = `movie:${movieId}`;
    if (lastFetchKeyRef.current === fetchKey) return;
    lastFetchKeyRef.current = fetchKey;

    setStream({ ...EMPTY_STREAM, loading: true });

    try {
      const res = await fetch(`/api/stream/vidlink?tmdbId=${movieId}&type=movie`);
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
  }, [movieId]);

  // When movie title is available, kick off the stream fetch.
  useEffect(() => {
    if (!movie?.title) return;
    loadStreams(movie.title);
  }, [movie, loadStreams]);

  // Combine sources depending on active tab.
  const activeSources: PlayerSource[] =
    activeTab === "hls" && stream.hls.length > 0 ? stream.hls : stream.sources;

  // Determine the poster URL for the video element.
  const posterUrl = movie?.backdrop_path
    ? `https://image.tmdb.org/t/p/w780${movie.backdrop_path}`
    : movie?.poster_path
      ? `https://image.tmdb.org/t/p/w780${movie.poster_path}`
      : undefined;

  const year = movie?.release_date?.split("-")[0];
  const hours = movie?.runtime ? Math.floor(movie.runtime / 60) : 0;
  const minutes = movie?.runtime ? movie.runtime % 60 : 0;
  const director = movie?.credits?.crew?.find(c => c.job === "Director");
  const topCast = movie?.credits?.cast?.slice(0, 12) || [];
  const score = movie?.vote_average != null ? (movie.vote_average > 10 ? movie.vote_average / 10 : movie.vote_average) : 0;
  const related = (movie?.similar?.results?.length ? movie.similar.results : movie?.recommendations?.results) || [];

  return (
    <div className="min-h-screen bg-[#050608] fade-in">
      {/* ═══ Top bar ═══ */}
      <div className="flex items-center gap-3 px-4 lg:px-8 h-14 border-b border-white/[0.05]">
        <button
          onClick={() => (movie ? navigate({ page: "movie-detail", id: movie.id }) : navigate({ page: "movies" }))}
          className="inline-flex items-center gap-2 text-[13px] font-bold text-[#a1a7b3] hover:text-white transition-colors"
          style={{ fontFamily: GROTESK }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
          Back
        </button>
        <span className="w-px h-4 bg-white/10" />
        <div className="min-w-0 flex items-center gap-2.5">
          <svg className="w-3.5 h-3.5 text-[#48a6ff] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="6" width="18" height="12" rx="2" strokeDasharray="2 2" /><circle cx="8" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#48a6ff] shrink-0" style={{ fontFamily: GROTESK }}>Screening Room</span>
          <h1 className="text-[13px] font-bold text-[#e8eaee] truncate" style={{ fontFamily: GROTESK }}>{movie?.title || "Loading..."}</h1>
        </div>
        <button
          onClick={() => navigate({ page: "movies" })}
          className="ml-auto text-[12px] font-bold text-[#767d8a] hover:text-white transition-colors shrink-0"
          style={{ fontFamily: GROTESK }}
        >
          All Movies
        </button>
      </div>

      <div className="max-w-[1200px] mx-auto px-0 lg:px-8 pt-0 lg:pt-6 pb-16 space-y-4">
        {/* ═══ Marquee lights strip ═══ */}
        <div className="flex items-center justify-between mx-4 lg:mx-0 px-1" aria-hidden="true">
          {Array.from({ length: 18 }).map((_, i) => (
            <i key={i} className="w-1.5 h-1.5 rounded-full bg-[#48a6ff] shadow-[0_0_7px_1.5px_rgba(72,166,255,0.75)]" style={{ animation: `ltv-cinema-twinkle 2s ease-in-out ${(i % 3) * 0.5}s infinite` }} />
          ))}
        </div>

        {/* ═══ Player ═══ */}
        <div
          className="relative w-full aspect-video bg-black overflow-hidden lg:rounded-2xl border-y lg:border border-white/[0.07]"
          style={{ boxShadow: "0 24px 80px rgba(30,136,255,0.10)" }}
        >
          {stream.loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full border-2 border-[#1e88ff] border-t-transparent animate-spin" />
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
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto border border-[#1e88ff]/30 bg-[#1e88ff]/10">
                  <svg className="w-7 h-7 text-[#48a6ff]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  </svg>
                </div>
                <p className="text-[#e8eaee] text-[14px] font-semibold" style={{ fontFamily: GROTESK }}>
                  {stream.error || "No direct streams available for this movie."}
                </p>
                <p className="text-[#767d8a] text-[12px]">
                  Source: <span className="font-bold text-[#a1a7b3]">{stream.origin || "none"}</span> — Vidlink + Moviebox fallback exhausted.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ═══ Quality deck (replaces the old server list) ═══ */}
        <div className="mx-4 lg:mx-0 rounded-2xl bg-[#0a0d13] border border-white/[0.07] p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#48a6ff]" style={{ fontFamily: GROTESK }}>Quality</span>
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
              activeSources.map((s, idx) => {
                // Show quality buttons as info pills — the actual selection
                // happens inside the player (hover the quality button at the
                // bottom-right of the video). These pills show what's available.
                return (
                  <span
                    key={`q-${idx}`}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-[12px] font-bold border border-white/[0.08] bg-white/[0.02] text-[#c4c9d2]"
                    style={{ fontFamily: GROTESK }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#48a6ff]" />
                    {s.quality}
                    <span className="text-[9px] uppercase opacity-60 text-[#5b616c]">{s.format}</span>
                  </span>
                );
              })
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

        {/* ═══ About panel ═══ */}
        {movie && (
          <div className="mx-4 lg:mx-0 rounded-2xl bg-[#0a0d13] border border-white/[0.07] p-4 sm:p-6">
            <div className="flex gap-4 sm:gap-6">
              {movie.poster_path && (
                <img
                  src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                  alt={movie.title}
                  className="w-24 sm:w-32 rounded-xl shrink-0 object-cover border border-white/[0.08] self-start"
                />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-2xl font-extrabold text-[#e8eaee] tracking-tight" style={{ fontFamily: GROTESK }}>{movie.title}</h2>
                {movie.tagline && <p className="text-[12px] text-[#767d8a] italic mt-1">&quot;{movie.tagline}&quot;</p>}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {score > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold text-[#48a6ff] border border-[#48a6ff]/30 bg-[#1e88ff]/10">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                      {score.toFixed(1)}
                    </span>
                  )}
                  {year && <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#a1a7b3] border border-white/10 bg-white/[0.04]">{year}</span>}
                  {movie.runtime ? <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#a1a7b3] border border-white/10 bg-white/[0.04]">{hours}h {minutes}m</span> : null}
                  {movie.genres?.slice(0, 3).map(g => (
                    <span key={g.id} className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#c4c9d2] border border-white/[0.08]">{g.name}</span>
                  ))}
                </div>
                {movie.overview && <p className="text-[13px] text-[#a1a7b3] leading-relaxed mt-3 line-clamp-4">{movie.overview}</p>}
                {director && (
                  <p className="mt-3 text-[12px]">
                    <span className="font-extrabold uppercase tracking-wider text-[10px] text-[#5b616c]" style={{ fontFamily: GROTESK }}>Director&nbsp;&nbsp;</span>
                    <span className="text-[#e8eaee] font-semibold">{director.name}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Cast strip */}
            {topCast.length > 0 && (
              <div className="mt-5 pt-5 border-t border-white/[0.06]">
                <span className="block text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#48a6ff] mb-3" style={{ fontFamily: GROTESK }}>Top Cast</span>
                <div className="flex gap-4 overflow-x-auto scroll-container pb-1">
                  {topCast.map(person => (
                    <div key={person.id} className="shrink-0 text-center w-[76px]">
                      <div className="w-[64px] h-[64px] rounded-full bg-[#10141c] overflow-hidden mx-auto mb-1.5 border border-white/[0.08]">
                        {person.profile_path ? (
                          <img src={`https://image.tmdb.org/t/p/w185${person.profile_path}`} alt={person.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-base text-[#5b616c] font-bold">{person.name.charAt(0)}</div>
                        )}
                      </div>
                      <p className="text-[10px] text-[#e8eaee] font-semibold line-clamp-1">{person.name}</p>
                      {person.character && <p className="text-[9px] text-[#5b616c] line-clamp-1">{person.character}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ More like this ═══ */}
        {related.length > 0 && (
          <section className="mx-4 lg:mx-0 pt-4 space-y-3">
            <h3 className="text-lg font-extrabold text-[#e8eaee] tracking-tight" style={{ fontFamily: GROTESK }}>More Like This</h3>
            <div className="flex gap-3 overflow-x-auto scroll-container pb-2">
              {related.slice(0, 14).map(item => (
                <div key={item.id} className="shrink-0 w-[130px] sm:w-[150px]">
                  <MovieCard item={{ ...item, media_type: "movie" }} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
