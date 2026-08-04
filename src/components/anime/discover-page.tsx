"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "./store";
import BrowseTabs from "./browse-tabs";
import { Music2, ChevronRight } from "lucide-react";

const TEXT_GRADIENT = "linear-gradient(180deg, #ffffff 0%, #a3a3a3 100%)";

/* ── Anime ── */
interface AnimeItem {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  coverImage?: { extraLarge?: string; large?: string; medium?: string };
  status?: string;
  episodes?: number;
}

function getTitle(a: { title?: { romaji?: string; english?: string; native?: string } }): string {
  return a?.title?.english || a?.title?.romaji || a?.title?.native || "Unknown";
}

function getStatusPill(status?: string): { label: string; className: string } | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s === "RELEASING" || s === "AIRING") return { label: "On-Going", className: "bg-emerald-500/15 text-emerald-400" };
  if (s === "FINISHED") return { label: "Finished", className: "bg-white/10 text-white/60" };
  if (s === "NOT_YET_RELEASED") return { label: "TBA", className: "bg-white/10 text-white/60" };
  if (s === "CANCELLED") return { label: "Cancelled", className: "bg-white/10 text-white/60" };
  if (s === "HIATUS") return { label: "Hiatus", className: "bg-white/10 text-white/60" };
  return { label: status, className: "bg-white/10 text-white/60" };
}

/* ── Manga ── */
interface MangaItem {
  id: string;
  title: string;
  poster?: string;
  cover?: string;
  type?: string;
  rating?: number;
}

const MANGA_TYPE_COLORS: Record<string, string> = {
  manga: "#8E7CE6",
  manhwa: "#3B82F6",
  manhua: "#F59E0B",
  novel: "#10B981",
};

/* ── Theme ── */
interface ThemeItem {
  id: number;
  type: string;
  animeName: string;
  songTitle: string;
  artist: string;
  cover: string;
}

/* ── Section header ── */
function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-karla text-xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: TEXT_GRADIENT }}>
        {title}
      </h2>
      <button onClick={onSeeAll} className="flex items-center gap-0.5 text-xs text-white/40 hover:text-white transition-colors">
        See All
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

export default function DiscoverPage() {
  const navigate = useAppStore(s => s.navigate);
  const setSectionSubPage = useAppStore(s => s.setSectionSubPage);

  const [trending, setTrending] = useState<AnimeItem[]>([]);
  const [manga, setManga] = useState<MangaItem[]>([]);
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [animeRes, mangaRes, themeRes] = await Promise.allSettled([
        fetch("/api/anime/anilist-trending?section=trending").then(r => r.ok ? r.json() : null),
        fetch("/api/manga/popular").then(r => r.ok ? r.json() : null),
        fetch("https://api.animethemes.moe/animetheme?page[size]=8&include=anime.images,song.artists&sort=-id").then(r => r.ok ? r.json() : null),
      ]);
      if (cancelled) return;

      if (animeRes.status === "fulfilled" && animeRes.value) {
        setTrending((animeRes.value.trending || animeRes.value.all || []).slice(0, 15));
      }
      if (mangaRes.status === "fulfilled" && mangaRes.value) {
        setManga((mangaRes.value.items || []).slice(0, 15));
      }
      if (themeRes.status === "fulfilled" && themeRes.value) {
        const list = (themeRes.value.animethemes || []).map((t: any) => ({
          id: t.id,
          type: t.type || "OP",
          animeName: t.anime?.name || "Unknown",
          songTitle: t.song?.title || "Untitled",
          artist: (t.song?.artists || []).map((a: any) => a.name).join(", ") || "Unknown Artist",
          cover: t.anime?.images?.find((i: any) => i.facet === "Small Cover")?.link
            || t.anime?.images?.find((i: any) => i.facet === "Large Cover")?.link || "",
        }));
        setThemes(list);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-white/10 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-16">
      <BrowseTabs active="discover" />

      {/* Trending Anime */}
      {trending.length > 0 && (
        <section className="px-4 md:px-8 lg:px-8 py-4">
          <SectionHeader title="Trending Anime" onSeeAll={() => { navigate({ page: "home" }); setSectionSubPage("browse"); }} />
          <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {trending.map(anime => {
              const cover = anime.coverImage?.extraLarge || anime.coverImage?.large || anime.coverImage?.medium || "";
              const title = getTitle(anime);
              const pill = getStatusPill(anime.status);
              return (
                <div
                  key={anime.id}
                  onClick={() => navigate({ page: "anime", id: String(anime.id) })}
                  className="group shrink-0 text-left cursor-pointer"
                  style={{ width: "170px" }}
                >
                  <div className="relative w-full aspect-[2/3] bg-white/5 overflow-hidden ring-1 ring-transparent group-hover:ring-white/20 transition-all duration-300" style={{ borderRadius: "12px" }}>
                    {cover ? (
                      <img src={cover} alt={title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/10 font-bold text-2xl">{title.charAt(0)}</div>
                    )}
                  </div>
                  <div className="mt-2.5 space-y-1">
                    <p className="text-[13px] font-medium text-white/90 leading-snug line-clamp-2">{title}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {pill && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${pill.className}`}>
                          {pill.label}
                        </span>
                      )}
                      {!!anime.episodes && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-white/60">
                          {anime.episodes} eps
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Popular Manga */}
      {manga.length > 0 && (
        <section className="px-4 md:px-8 lg:px-8 py-4">
          <SectionHeader title="Popular Manga" onSeeAll={() => { navigate({ page: "manga" }); setSectionSubPage("popular"); }} />
          <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {manga.map(m => {
              const cover = m.cover || m.poster || "";
              const type = (m.type || "manga").toLowerCase();
              const typeColor = MANGA_TYPE_COLORS[type] || "#8E7CE6";
              return (
                <div
                  key={m.id}
                  onClick={() => navigate({ page: "manga-detail", id: m.id })}
                  className="group shrink-0 text-left cursor-pointer"
                  style={{ width: "170px" }}
                >
                  <div className="relative w-full aspect-[2/3] bg-white/5 overflow-hidden ring-1 ring-transparent group-hover:ring-white/20 transition-all duration-300" style={{ borderRadius: "12px" }}>
                    {cover ? (
                      <img src={cover} alt={m.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/10 font-bold text-2xl">{m.title.charAt(0)}</div>
                    )}
                  </div>
                  <div className="mt-2.5 space-y-1">
                    <p className="text-[13px] font-medium text-white/90 leading-snug line-clamp-2">{m.title}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize" style={{ background: `${typeColor}26`, color: typeColor }}>
                        {type}
                      </span>
                      {!!m.rating && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-white/60">
                          ★ {(m.rating).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Latest Themes */}
      {themes.length > 0 && (
        <section className="px-4 md:px-8 lg:px-8 py-4">
          <SectionHeader title="Latest Themes" onSeeAll={() => navigate({ page: "music" })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {themes.map(t => (
              <button
                key={t.id}
                onClick={() => navigate({ page: "music" })}
                className="flex items-center gap-3 p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                  {t.cover ? (
                    <img src={t.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <Music2 size={16} className="text-white/40" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Music2 size={11} className="text-white/30 shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{t.type}</span>
                  </div>
                  <p className="text-[13px] font-semibold text-white truncate">{t.songTitle}</p>
                  <p className="text-[11px] text-white/40 truncate">{t.artist} · {t.animeName}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
