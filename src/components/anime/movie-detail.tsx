"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "./store";
import MovieCard from "./movie-card";
import type { TMDBContentItem } from "./store";

interface MovieDetail {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  vote_average?: number;
  vote_count?: number;
  genres?: Array<{ id: number; name: string }>;
  release_date?: string;
  runtime?: number;
  status?: string;
  tagline?: string;
  production_companies?: Array<{ id: number; name: string; logo_path?: string }>;
  credits?: {
    cast: Array<{ id: number; name: string; character?: string; profile_path?: string; order?: number }>;
    crew?: Array<{ id: number; name: string; job?: string; department?: string; profile_path?: string }>;
  };
  videos?: { results: Array<{ id: string; key: string; name: string; site: string; type: string }> };
  similar?: { results: TMDBContentItem[] };
  recommendations?: { results: TMDBContentItem[] };
  external_ids?: { imdb_id?: string };
  belongs_to_collection?: { id: number; name: string; poster_path?: string; backdrop_path?: string };
}

const GROTESK = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const ACCENT = "#1e88ff";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[#0a0d13] border border-white/[0.07] p-5 sm:p-6">
      <h3 className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#48a6ff] mb-4" style={{ fontFamily: GROTESK }}>{title}</h3>
      {children}
    </div>
  );
}

function RailSection({ title, items }: { title: string; items: TMDBContentItem[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-extrabold text-[#e8eaee] tracking-tight" style={{ fontFamily: GROTESK }}>{title}</h3>
      <div className="flex gap-3 overflow-x-auto scroll-container pb-2">
        {items.slice(0, 14).map(item => (
          <div key={item.id} className="shrink-0 w-[130px] sm:w-[150px]">
            <MovieCard item={{ ...item, media_type: "movie" }} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function MovieDetailPage({ movieId }: { movieId: number }) {
  const navigate = useAppStore(s => s.navigate);
  const addToLibrary = useAppStore(s => s.addToLibrary);
  const removeFromLibrary = useAppStore(s => s.removeFromLibrary);
  const inLibrary = useAppStore(s => s.library.some(e => e.key === `movie:${movieId}`));
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTrailer, setShowTrailer] = useState(false);

  const toggleLibrary = () => {
    if (!movie) return;
    if (inLibrary) { removeFromLibrary("movie", String(movieId)); return; }
    addToLibrary({
      kind: "movie", mediaId: String(movieId),
      title: (movie as any).title || (movie as any).original_title || "Movie",
      cover: (movie as any).poster_path ? `https://image.tmdb.org/t/p/w342${(movie as any).poster_path}` : "",
      meta: ((movie as any).release_date || "").slice(0, 4) || undefined,
      score: (movie as any).vote_average ? Math.round((movie as any).vote_average * 10) / 10 : undefined,
      resume: { page: "movie-detail", id: movieId },
    });
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/tmdb/detail?id=${movieId}&type=movie`);
        if (res.ok && !cancelled) setMovie(await res.json());
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [movieId]);

  if (loading) {
    return (
      <div className="space-y-6 fade-in">
        <div className="h-[62vh] skeleton rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="h-48 skeleton rounded-2xl lg:col-span-2" />
          <div className="h-48 skeleton rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="text-center py-24 rounded-2xl bg-[#0a0d13] border border-white/[0.06]">
        <p className="text-[#767d8a]">Movie not found</p>
        <button onClick={() => navigate({ page: "movies" })} className="mt-4 px-5 py-2.5 rounded-full text-[13px] font-bold text-[#48a6ff] border border-[#48a6ff]/40" style={{ fontFamily: GROTESK }}>
          Back to Movies
        </button>
      </div>
    );
  }

  const trailer = movie.videos?.results?.find(v => v.type === "Trailer" && v.site === "YouTube");
  const year = movie.release_date?.split("-")[0];
  const hours = movie.runtime ? Math.floor(movie.runtime / 60) : 0;
  const minutes = movie.runtime ? movie.runtime % 60 : 0;
  const director = movie.credits?.crew?.find(c => c.job === "Director");
  const score = movie.vote_average != null ? (movie.vote_average > 10 ? movie.vote_average / 10 : movie.vote_average) : 0;

  return (
    <div className="space-y-8 fade-in pb-4">
      {/* ═══ Hero — marquee-framed backdrop fading into page black ═══ */}
      <div className="ltv-cinema-marquee">
        <div className="ltv-cinema-lights" aria-hidden="true">
          {Array.from({ length: 20 }).map((_, i) => <i key={i} />)}
        </div>
        <div className="relative rounded-2xl overflow-hidden border border-white/[0.06] bg-[#0a0d13]">
        <div className="relative h-[64vh] sm:h-[72vh]">
          {movie.backdrop_path && (
            <img
              src={`https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`}
              alt={movie.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {showTrailer && trailer && (
            <div className="absolute inset-0 z-10 bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&mute=1&loop=1&playlist=${trailer.key}&controls=0&showinfo=0&modestbranding=1`}
                className="w-full h-full"
                allowFullScreen
                allow="autoplay; encrypted-media"
                style={{ filter: "brightness(0.75)" }}
              />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-[#050608] via-[#050608]/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050608] via-[#050608]/20 to-transparent" />

          {/* Content */}
          <div className="absolute bottom-0 left-0 right-0 z-20 p-5 sm:p-10">
            <div className="flex items-end gap-5 sm:gap-8">
              {movie.poster_path && (
                <img
                  src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                  alt={movie.title}
                  className="hidden sm:block w-[150px] lg:w-[200px] rounded-xl border border-white/10 shadow-2xl shadow-black/60 shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#48a6ff] mb-2" style={{ fontFamily: GROTESK }}>
                  <span className="w-5 h-px bg-[#48a6ff]" />
                  Movie
                </span>
                <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-[#e8eaee] tracking-tight line-clamp-2 mb-2" style={{ fontFamily: GROTESK }}>
                  {movie.title}
                </h1>
                {movie.tagline && <p className="text-sm text-[#767d8a] italic mb-3">&quot;{movie.tagline}&quot;</p>}

                <div className="flex items-center gap-2 flex-wrap mb-4">
                  {score > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold text-[#48a6ff] border border-[#48a6ff]/30 bg-[#1e88ff]/10">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                      {score.toFixed(1)}
                      {movie.vote_count ? <span className="text-[#767d8a] font-semibold">({(movie.vote_count / 1000).toFixed(1)}k)</span> : null}
                    </span>
                  )}
                  {year && <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#a1a7b3] border border-white/10 bg-white/[0.04]">{year}</span>}
                  {movie.runtime ? <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#a1a7b3] border border-white/10 bg-white/[0.04]">{hours}h {minutes}m</span> : null}
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#a1a7b3] border border-white/10 bg-white/[0.04]">HD</span>
                  {movie.genres?.slice(0, 4).map(g => (
                    <span key={g.id} className="hidden sm:inline px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#c4c9d2] border border-white/[0.08]">{g.name}</span>
                  ))}
                </div>

                {movie.overview && (
                  <p className="hidden sm:block text-sm text-[#a1a7b3] leading-relaxed line-clamp-3 max-w-2xl mb-5">{movie.overview}</p>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => navigate({ page: "movie-watch", id: movie.id })} className="ltv-cinema-stub" style={{ fontFamily: GROTESK }}>
                    <span className="ltv-cinema-stub-tab">ADMIT<br />ONE</span>
                    <span className="ltv-cinema-stub-label">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                      Watch Now
                    </span>
                  </button>
                  {trailer && (
                    <button
                      onClick={() => setShowTrailer(!showTrailer)}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-[#e8eaee] border border-white/15 bg-[#0a0d13]/80 hover:border-[#48a6ff]/50 transition-colors"
                      style={{ fontFamily: GROTESK }}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {showTrailer ? "Hide Trailer" : "Trailer"}
                    </button>
                  )}
                  <button
                    onClick={toggleLibrary}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold border transition-colors"
                    style={{ fontFamily: GROTESK, color: inLibrary ? "#48a6ff" : "#e8eaee", borderColor: inLibrary ? "rgba(72,166,255,0.5)" : "rgba(255,255,255,0.15)", background: inLibrary ? "rgba(72,166,255,0.1)" : "rgba(10,13,19,0.8)" }}
                  >
                    <svg className="w-4 h-4" fill={inLibrary ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                    {inLibrary ? "In My List" : "My List"}
                  </button>
                </div>
              </div>

              {score > 0 && (
                <div className="ltv-cinema-stamp hidden lg:flex">
                  <b>{score.toFixed(1)}</b>
                  <span>Rated</span>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* ═══ Storyline + Facts ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Panel title="Storyline">
            <p className="text-sm text-[#a1a7b3] leading-relaxed">{movie.overview || "No synopsis available."}</p>
            {movie.genres && movie.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {movie.genres.map(g => (
                  <span key={g.id} className="px-3 py-1 text-[11px] font-bold rounded-full text-[#c4c9d2] border border-white/[0.1] bg-white/[0.03]" style={{ fontFamily: GROTESK }}>{g.name}</span>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <Panel title="Details">
          <dl className="space-y-3">
            {[
              ["Director", director?.name],
              ["Release Date", movie.release_date],
              ["Runtime", movie.runtime ? `${hours}h ${minutes}m` : undefined],
              ["Status", movie.status],
              ["Studio", movie.production_companies?.slice(0, 2).map(c => c.name).join(", ")],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k as string} className="flex items-baseline justify-between gap-4">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-[#5b616c]" style={{ fontFamily: GROTESK }}>{k}</dt>
                <dd className="text-[13px] font-semibold text-[#e8eaee] text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      {/* ═══ Cast ═══ */}
      {movie.credits?.cast && movie.credits.cast.length > 0 && (
        <Panel title="Top Cast">
          <div className="flex gap-4 overflow-x-auto scroll-container pb-2">
            {movie.credits.cast.slice(0, 14).map(person => (
              <div key={person.id} className="shrink-0 text-center w-[86px]">
                <div className="w-[76px] h-[76px] rounded-full bg-[#10141c] overflow-hidden mx-auto mb-2 border border-white/[0.08]">
                  {person.profile_path ? (
                    <img src={`https://image.tmdb.org/t/p/w185${person.profile_path}`} alt={person.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg text-[#5b616c] font-bold">{person.name.charAt(0)}</div>
                  )}
                </div>
                <p className="text-[11px] text-[#e8eaee] font-semibold line-clamp-1">{person.name}</p>
                {person.character && <p className="text-[10px] text-[#5b616c] line-clamp-1 mt-0.5">{person.character}</p>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ═══ Collection callout ═══ */}
      {movie.belongs_to_collection && (
        <div className="relative rounded-2xl overflow-hidden border border-white/[0.07] bg-[#0a0d13] p-6 sm:p-8">
          {movie.belongs_to_collection.backdrop_path && (
            <>
              <img
                src={`https://image.tmdb.org/t/p/w1280${movie.belongs_to_collection.backdrop_path}`}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-25"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#050608] to-[#050608]/40" />
            </>
          )}
          <div className="relative">
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#48a6ff] mb-1" style={{ fontFamily: GROTESK }}>Part of a saga</span>
            <h3 className="text-xl font-extrabold text-[#e8eaee]" style={{ fontFamily: GROTESK }}>{movie.belongs_to_collection.name}</h3>
          </div>
        </div>
      )}

      {/* ═══ Similar + Recommended ═══ */}
      <RailSection title="You May Also Like" items={movie.similar?.results || []} />
      <RailSection title="More Like This" items={movie.recommendations?.results || []} />
    </div>
  );
}
