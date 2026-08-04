"use client";

/**
 * Scraper Anime Page — shows AniList metadata + episode list from selected site.
 *
 * URL: #scraper/anime/{anilistId}
 *
 * Features:
 *   - Full AniList metadata (cover, banner, title, description, genres, score)
 *   - Site switcher: Miruro, Animex, Lunar (shows what each supports)
 *   - Episode list with sub/dub/hardsub/harddub variant badges
 *   - Click episode → /scraper/watch/{site}/{anilistId}/{episodeId}
 */

import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/components/anime/store";
import { SITES, type UnifiedEpisodesResponse, type UnifiedEpisode } from "@/lib/unified-scraper";

interface AniListMeta {
  id: number;
  title?: { romaji?: string; english?: string; native?: string };
  coverImage?: { extraLarge?: string; large?: string; medium?: string; color?: string };
  bannerImage?: string;
  description?: string;
  format?: string;
  status?: string;
  episodes?: number;
  duration?: number;
  genres?: string[];
  averageScore?: number;
  meanScore?: number;
  popularity?: number;
  season?: string;
  seasonYear?: number;
  studios?: { nodes: Array<{ id: number; name: string; isAnimationStudio: boolean }> };
  nextAiringEpisode?: { episode: number; airingAt: number };
  externalLinks?: Array<{ id: number; url: string; site: string; type: string; icon?: string; color?: string }>;
}

export default function ScraperAnimePage({ anilistId }: { anilistId: string }) {
  const navigate = useAppStore((s) => s.navigate);
  const id = parseInt(anilistId, 10);

  const [meta, setMeta] = useState<AniListMeta | null>(null);
  const [site, setSite] = useState<string>("miruro");
  const [episodes, setEpisodes] = useState<UnifiedEpisodesResponse | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingEps, setLoadingEps] = useState(false);

  // Fetch AniList metadata
  useEffect(() => {
    if (!id) return;
    setLoadingMeta(true);
    fetch(`/api/anime/scraper/meta/${id}`)
      .then((r) => r.json())
      .then((d) => setMeta(d.error ? null : d))
      .catch(() => setMeta(null))
      .finally(() => setLoadingMeta(false));
  }, [id]);

  // Fetch episodes when site changes
  const fetchEpisodes = useCallback(async (siteId: string) => {
    setLoadingEps(true);
    setEpisodes(null);
    try {
      const res = await fetch(`/api/anime/scraper/episodes/${siteId}/${id}`);
      const data = await res.json();
      setEpisodes(data);
    } catch (e) {
      console.error("Failed to fetch episodes", e);
    } finally {
      setLoadingEps(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEpisodes(site);
  }, [site, fetchEpisodes]);

  if (loadingMeta) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#ffffff] animate-spin mx-auto mb-3" />
          <p className="text-xs text-white/40">Loading from AniList...</p>
        </div>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-white/60 mb-3">Anime not found</p>
          <button onClick={() => navigate({ page: "scraper" })} className="text-xs text-[#ffffff] hover:underline">
            ← Back to search
          </button>
        </div>
      </div>
    );
  }

  const title = meta.title?.english || meta.title?.romaji || meta.title?.native || "Unknown";
  const cover = meta.coverImage?.extraLarge || meta.coverImage?.large || meta.coverImage?.medium || "";
  const mainStudio = meta.studios?.nodes?.find((s) => s.isAnimationStudio);

  return (
    <div className="text-white">
      {/* Banner */}
      {meta.bannerImage && (
        <div className="relative h-[200px] lg:h-[320px] -mx-4 lg:-mx-8 -mt-4 mb-6 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={meta.bannerImage} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#000] via-[#000]/60 to-transparent" />
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 mb-8">
        {/* Cover */}
        <div className="flex-shrink-0 mx-auto lg:mx-0">
          <div className="w-[180px] lg:w-[220px] aspect-[2/3] rounded-lg overflow-hidden border border-white/10 shadow-2xl">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt={title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-white/5 flex items-center justify-center text-white/20 text-xs">No cover</div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <button onClick={() => navigate({ page: "scraper" })} className="text-xs text-white/40 hover:text-white/70 mb-3 transition">
            ← Back to search
          </button>
          <h1 className="text-2xl lg:text-4xl font-extrabold mb-2" style={{ fontFamily: "var(--font-space-grotesk), 'Space Grotesk', sans-serif" }}>
            {title}
          </h1>
          {meta.title?.romaji && meta.title?.english && meta.title.romaji !== meta.title.english && (
            <p className="text-sm text-white/50 mb-3">{meta.title.romaji}</p>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
            {meta.averageScore && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#D4A017]/10 border border-[#D4A017]/30 rounded">
                <span className="text-[#D4A017] font-bold">{meta.averageScore}%</span>
                <span className="text-white/40">score</span>
              </div>
            )}
            {meta.format && <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded">{meta.format}</span>}
            {meta.episodes && <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded">{meta.episodes} eps</span>}
            {meta.seasonYear && <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded">{meta.season} {meta.seasonYear}</span>}
            {meta.status && <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded">{meta.status.replace("_", " ")}</span>}
            {mainStudio && <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded">{mainStudio.name}</span>}
          </div>

          {/* Genres */}
          {meta.genres && meta.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {meta.genres.map((g) => (
                <span key={g} className="text-[10px] px-2 py-0.5 bg-[#ffffff]/10 border border-[#ffffff]/30 text-[#ffffff] rounded-full">{g}</span>
              ))}
            </div>
          )}

          {/* Description */}
          {meta.description && (
            <p className="text-sm text-white/70 leading-relaxed line-clamp-4 mb-4 max-w-2xl">
              {meta.description.replace(/<[^>]+>/g, "")}
            </p>
          )}

          {/* Next airing */}
          {meta.nextAiringEpisode && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#D4A017]/10 border border-[#D4A017]/30 rounded text-xs">
              <span className="text-[#D4A017] font-bold">Ep {meta.nextAiringEpisode.episode}</span>
              <span className="text-white/60">airs in {Math.ceil(meta.nextAiringEpisode.airingAt - Date.now() / 1000) > 0 ? `${Math.ceil((meta.nextAiringEpisode.airingAt - Date.now() / 1000) / 86400)}d` : "soon"}</span>
            </div>
          )}
        </div>
      </div>

      {/* Site switcher */}
      <div className="mb-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-3">Streaming Source</h2>
        <div className="flex flex-wrap gap-2">
          {SITES.map((s) => {
            const active = site === s.site;
            return (
              <button
                key={s.site}
                onClick={() => setSite(s.site)}
                className={`px-4 py-2 rounded-lg border transition text-left ${
                  active
                    ? "bg-[#ffffff] border-[#ffffff] text-white"
                    : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20"
                }`}
              >
                <div className="text-sm font-bold">{s.name}</div>
                <div className="flex items-center gap-1 mt-1 text-[9px] opacity-80">
                  {s.supportsSub && <span className="px-1 py-0.5 bg-black/30 rounded">SUB</span>}
                  {s.supportsDub && <span className="px-1 py-0.5 bg-black/30 rounded">DUB</span>}
                  {s.supportsHardsub && <span className="px-1 py-0.5 bg-black/30 rounded">HARDSUB</span>}
                  {s.supportsHarddub && <span className="px-1 py-0.5 bg-black/30 rounded">HARDDUB</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Episodes */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white/50">
            Episodes {episodes?.totalEpisodes ? `(${episodes.totalEpisodes} total)` : ""}
          </h2>
          {episodes?.episodes?.length ? (
            <span className="text-xs text-white/40">{episodes.episodes.length} available</span>
          ) : null}
        </div>

        {loadingEps ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-[#ffffff] animate-spin mx-auto mb-3" />
            <p className="text-xs text-white/40">Fetching from {site}...</p>
          </div>
        ) : !episodes?.episodes?.length ? (
          <div className="text-center py-12 text-white/40 text-sm">
            No episodes found from {site}. Try a different source.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {episodes.episodes.map((ep) => (
              <EpisodeRow
                key={`${site}-${ep.number}`}
                ep={ep}
                onClick={() =>
                  navigate({
                    page: "scraper-watch",
                    id: String(id),
                    site,
                    episode: ep.id,
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EpisodeRow({ ep, onClick }: { ep: UnifiedEpisode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 hover:border-white/15 hover:bg-white/[0.06] rounded-lg transition text-left"
    >
      {/* Thumbnail */}
      <div className="flex-shrink-0 w-20 h-12 rounded overflow-hidden bg-white/5 relative">
        {ep.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ep.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-[10px]">EP</div>
        )}
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition flex items-center justify-center">
          <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">EP {ep.number}</span>
          {ep.isFiller && <span className="text-[9px] px-1 py-0.5 bg-white/10 rounded text-white/50">FILLER</span>}
        </div>
        {ep.title && <div className="text-xs text-white/50 line-clamp-1">{ep.title}</div>}
        <div className="flex flex-wrap gap-1 mt-1">
          {ep.variants.map((v) => (
            <span
              key={v}
              className={`text-[8px] px-1 py-0.5 rounded ${
                v === "sub" ? "bg-blue-500/20 text-blue-300" :
                v === "dub" ? "bg-green-500/20 text-green-300" :
                v === "hardsub" ? "bg-purple-500/20 text-purple-300" :
                "bg-orange-500/20 text-orange-300"
              }`}
            >
              {v.toUpperCase()}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
