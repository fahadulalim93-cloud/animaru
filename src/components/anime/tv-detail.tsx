"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "./store";
import MovieCard from "./movie-card";
import type { TMDBContentItem } from "./store";

interface TVDetail {
  id: number;
  name: string;
  original_name?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  vote_average?: number;
  vote_count?: number;
  genres?: Array<{ id: number; name: string }>;
  first_air_date?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  tagline?: string;
  networks?: Array<{ id: number; name: string; logo_path?: string }>;
  credits?: {
    cast: Array<{ id: number; name: string; character?: string; profile_path?: string; order?: number }>;
  };
  videos?: { results: Array<{ id: string; key: string; name: string; site: string; type: string }> };
  similar?: { results: TMDBContentItem[] };
  recommendations?: { results: TMDBContentItem[] };
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[#0a0d13] border border-white/[0.07] p-5 sm:p-6">
      <h3 className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#34D399] mb-4" style={{ fontFamily: GROTESK }}>{title}</h3>
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
            <MovieCard item={{ ...item, media_type: "tv" }} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function TVDetailPage({ tvId }: { tvId: number }) {
  const navigate = useAppStore(s => s.navigate);
  const addToLibrary = useAppStore(s => s.addToLibrary);
  const removeFromLibrary = useAppStore(s => s.removeFromLibrary);
  const inLibrary = useAppStore(s => s.library.some(e => e.key === `tv:${tvId}`));
  const [show, setShow] = useState<TVDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTrailer, setShowTrailer] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState<SeasonEpisodes | null>(null);

  const toggleLibrary = () => {
    if (!show) return;
    if (inLibrary) { removeFromLibrary("tv", String(tvId)); return; }
    addToLibrary({
      kind: "tv", mediaId: String(tvId),
      title: (show as any).name || "TV Show",
      cover: (show as any).poster_path ? `https://image.tmdb.org/t/p/w342${(show as any).poster_path}` : "",
      meta: ((show as any).first_air_date || "").slice(0, 4) || undefined,
      score: (show as any).vote_average ? Math.round((show as any).vote_average * 10) / 10 : undefined,
      resume: { page: "tv-detail", id: tvId },
    });
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/tmdb/detail?id=${tvId}&type=tv`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setShow(data);
          setSelectedSeason(1);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [tvId]);

  useEffect(() => {
    if (!tvId || !selectedSeason) return;
    let cancelled = false;
    async function loadSeason() {
      try {
        const res = await fetch(`/api/tmdb/season?tvId=${tvId}&season=${selectedSeason}`);
        if (res.ok && !cancelled) setEpisodes(await res.json());
      } catch { /* ignore */ }
    }
    loadSeason();
    return () => { cancelled = true; };
  }, [tvId, selectedSeason]);

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

  if (!show) {
    return (
      <div className="text-center py-24 rounded-2xl bg-[#0a0d13] border border-white/[0.06]">
        <p className="text-[#767d8a]">TV show not found</p>
        <button onClick={() => navigate({ page: "tv" })} className="mt-4 px-5 py-2.5 rounded-full text-[13px] font-bold text-[#34D399] border border-[#34D399]/40" style={{ fontFamily: GROTESK }}>
          Back to TV Shows
        </button>
      </div>
    );
  }

  const trailer = show.videos?.results?.find(v => v.type === "Trailer" && v.site === "YouTube");
  const year = show.first_air_date?.split("-")[0];
  const score = show.vote_average != null ? (show.vote_average > 10 ? show.vote_average / 10 : show.vote_average) : 0;

  return (
    <div className="space-y-8 fade-in pb-4">
      {/* ═══ Hero — broadcast monitor ═══ */}
      <div className="ltv-tv-hero relative rounded-2xl overflow-hidden border border-white/[0.06] bg-[#0a0d13]">
        <div className="ltv-tv-sweep" />
        <div className="absolute top-5 left-5 sm:left-9 z-20 flex items-center gap-3">
          <span className="ltv-tv-signal"><i /><i /><i />Signal Locked</span>
        </div>
        <div className="relative h-[64vh] sm:h-[72vh]">
          {show.backdrop_path && (
            <img
              src={`https://image.tmdb.org/t/p/w1280${show.backdrop_path}`}
              alt={show.name}
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

          <div className="absolute bottom-0 left-0 right-0 z-20 p-5 sm:p-10">
            <div className="flex items-end gap-5 sm:gap-8">
              {show.poster_path && (
                <img
                  src={`https://image.tmdb.org/t/p/w342${show.poster_path}`}
                  alt={show.name}
                  className="hidden sm:block w-[150px] lg:w-[200px] rounded-xl border border-white/10 shadow-2xl shadow-black/60 shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#34D399] mb-2" style={{ fontFamily: GROTESK }}>
                  <span className="w-5 h-px bg-[#34D399]" />
                  TV Show
                </span>
                <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-[#e8eaee] tracking-tight line-clamp-2 mb-2" style={{ fontFamily: GROTESK }}>
                  {show.name}
                </h1>
                {show.tagline && <p className="text-sm text-[#767d8a] italic mb-3">&quot;{show.tagline}&quot;</p>}

                <div className="flex items-center gap-2 flex-wrap mb-4">
                  {score > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold text-[#34D399] border border-[#34D399]/30 bg-[#34D399]/10">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                      {score.toFixed(1)}
                      {show.vote_count ? <span className="text-[#767d8a] font-semibold">({(show.vote_count / 1000).toFixed(1)}k)</span> : null}
                    </span>
                  )}
                  {year && <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#a1a7b3] border border-white/10 bg-white/[0.04]">{year}</span>}
                  {show.number_of_seasons ? <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#a1a7b3] border border-white/10 bg-white/[0.04]">{show.number_of_seasons} Season{show.number_of_seasons > 1 ? "s" : ""}</span> : null}
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#a1a7b3] border border-white/10 bg-white/[0.04]">HD</span>
                  {show.genres?.slice(0, 4).map(g => (
                    <span key={g.id} className="hidden sm:inline px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#c4c9d2] border border-white/[0.08]">{g.name}</span>
                  ))}
                </div>

                {show.overview && (
                  <p className="hidden sm:block text-sm text-[#a1a7b3] leading-relaxed line-clamp-3 max-w-2xl mb-5">{show.overview}</p>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => navigate({ page: "tv-watch", id: show.id, season: 1, episode: 1 })}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
                    style={{ background: ACCENT, boxShadow: "0 8px 28px rgba(52,211,153,0.30)", fontFamily: GROTESK }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    Watch Now
                  </button>
                  {trailer && (
                    <button
                      onClick={() => setShowTrailer(!showTrailer)}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-[#e8eaee] border border-white/15 bg-[#0a0d13]/80 hover:border-[#34D399]/50 transition-colors"
                      style={{ fontFamily: GROTESK }}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {showTrailer ? "Hide Trailer" : "Trailer"}
                    </button>
                  )}
                  <button
                    onClick={toggleLibrary}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold border transition-colors"
                    style={{ fontFamily: GROTESK, color: inLibrary ? "#34D399" : "#e8eaee", borderColor: inLibrary ? "rgba(52,211,153,0.5)" : "rgba(255,255,255,0.15)", background: inLibrary ? "rgba(52,211,153,0.1)" : "rgba(10,13,19,0.8)" }}
                  >
                    <svg className="w-4 h-4" fill={inLibrary ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                    {inLibrary ? "In My List" : "My List"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Storyline + Facts ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Panel title="Storyline">
            <p className="text-sm text-[#a1a7b3] leading-relaxed">{show.overview || "No synopsis available."}</p>
            {show.genres && show.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {show.genres.map(g => (
                  <span key={g.id} className="px-3 py-1 text-[11px] font-bold rounded-full text-[#c4c9d2] border border-white/[0.1] bg-white/[0.03]" style={{ fontFamily: GROTESK }}>{g.name}</span>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <Panel title="Details">
          <dl className="space-y-3">
            {[
              ["First Air Date", show.first_air_date],
              ["Seasons", show.number_of_seasons],
              ["Episodes", show.number_of_episodes],
              ["Status", show.status],
              ["Network", show.networks?.slice(0, 2).map(n => n.name).join(", ")],
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
      {show.credits?.cast && show.credits.cast.length > 0 && (
        <Panel title="Top Cast">
          <div className="flex gap-4 overflow-x-auto scroll-container pb-2">
            {show.credits.cast.slice(0, 14).map(person => (
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

      {/* ═══ Episodes — program guide ═══ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="ltv-tv-chbadge"><i />Program Guide</span>
          {show.number_of_seasons && show.number_of_seasons > 1 && (
            <select
              value={selectedSeason}
              onChange={e => setSelectedSeason(parseInt(e.target.value))}
              className="bg-[#0a0d13] text-[#c4c9d2] text-[12px] font-bold px-4 py-2 rounded-full border border-white/[0.1] outline-none focus:border-[#34D399]/40"
              style={{ fontFamily: GROTESK }}
            >
              {Array.from({ length: show.number_of_seasons }, (_, i) => (
                <option key={i + 1} value={i + 1}>Season {i + 1}</option>
              ))}
            </select>
          )}
        </div>

        <div className="space-y-2">
          {episodes?.episodes ? episodes.episodes.map(ep => (
            <button
              key={ep.id}
              onClick={() => navigate({ page: "tv-watch", id: show.id, season: ep.season_number, episode: ep.episode_number })}
              className="ltv-tv-slot w-full flex items-center gap-3 sm:gap-4 p-2.5 sm:p-3 pl-4 sm:pl-5 rounded-xl text-left bg-[#0a0d13] border border-white/[0.06] hover:border-[#34D399]/40 transition-all group"
            >
              <div className="w-24 h-14 sm:w-32 sm:h-[74px] rounded-lg overflow-hidden shrink-0 bg-[#10141c] relative">
                {ep.still_path ? (
                  <img src={`https://image.tmdb.org/t/p/w300${ep.still_path}`} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#5b616c]">{ep.episode_number}</div>
                )}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50">
                  <svg className="w-6 h-6 sm:w-7 sm:h-7 text-[#34D399]" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#e8eaee] line-clamp-1">{ep.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-[#34D399] font-extrabold" style={{ fontFamily: GROTESK }}>EP {ep.episode_number}</span>
                  {ep.runtime ? <span className="text-[10px] text-[#5b616c]">{ep.runtime}m</span> : null}
                  {ep.air_date && <span className="text-[10px] text-[#5b616c] hidden sm:inline">{ep.air_date}</span>}
                </div>
                {ep.overview && <p className="text-[11px] text-[#767d8a] line-clamp-1 mt-1 hidden sm:block">{ep.overview}</p>}
              </div>
            </button>
          )) : (
            Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 p-3">
                <div className="w-32 h-[74px] rounded-lg skeleton" />
                <div className="flex-1 space-y-1.5"><div className="h-4 w-48 skeleton rounded" /><div className="h-3 w-24 skeleton rounded" /></div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ═══ Similar + Recommended ═══ */}
      <RailSection title="You May Also Like" items={show.similar?.results || []} />
      <RailSection title="More Like This" items={show.recommendations?.results || []} />
    </div>
  );
}
