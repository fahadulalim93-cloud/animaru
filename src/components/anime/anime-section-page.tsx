"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "./store";
import type { MiruroAnimeResult } from "@/lib/miruro-api";
import BrowsePage from "./browse-page";
import SchedulePage from "./schedule-page";
import DubSubPage from "./dub-sub-page";
import { Plus, Flame, Play } from "lucide-react";
import DiscordWidget from "./discord-widget-inline";
import JoinTheSquadStrip from "./join-the-squad-strip";

type SubPage = "home" | "browse" | "schedule";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

interface FeaturedAnime {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  bannerImage?: string;
  coverImage?: { extraLarge?: string; large?: string; medium?: string; color?: string };
  description?: string;
  format?: string;
  episodes?: number;
  averageScore?: number;
  genres?: string[];
  season?: string;
  seasonYear?: number;
  status?: string;
  nextAiringEpisode?: { episode: number; airingAt: number };
}

interface AnimeItem {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  coverImage?: { extraLarge?: string; large?: string; medium?: string; color?: string };
  bannerImage?: string;
  format?: string;
  episodes?: number;
  seasonYear?: number;
  averageScore?: number;
  genres?: string[];
  status?: string;
  description?: string;
  popularity?: number;
  nextAiringEpisode?: { episode: number; airingAt: number };
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function getTitle(a: any): string {
  return a?.title?.english || a?.title?.romaji || a?.title?.native || "Unknown";
}

function getBanner(a: any): string {
  // Prefer bannerImage (high quality), then extraLarge cover
  const banner = a?.bannerImage;
  if (banner) return banner;
  // Fallback to cover image (extra large)
  return a?.coverImage?.extraLarge || a?.coverImage?.large || "";
}

function getCover(a: any): string {
  return a?.coverImage?.extraLarge || a?.coverImage?.large || a?.coverImage?.medium || "";
}

function getScore(a: any): number {
  const s = a?.averageScore;
  if (!s) return 0;
  return s > 100 ? Math.round(s / 10) : s;
}

function formatCount(n?: number): string {
  const v = n || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

// Shared "+" (add to list) click handler for every poster card on the home
// page. No AniList/MAL linked yet → the focused connect prompt (always this
// minimal card, never the full email/password sign-in form); AniList linked
// → the real edit-entry modal, synced to their AniList list.
function handleAddToList(e: React.MouseEvent, anime: { id: number; title: string; cover?: string }) {
  e.stopPropagation();
  const { anilistToken, malToken, openConnectListModal, openEditListModal } = useAppStore.getState();
  if (anilistToken) { openEditListModal(anime); return; }
  if (!malToken) { openConnectListModal(); return; }
}

// Manga cards use a provider id ("at:xxxxx"), not an AniList media id, so
// they can't open the AniList-synced edit modal — just the connect prompt.
function handleAddToListManga(e: React.MouseEvent) {
  e.stopPropagation();
  const { anilistToken, malToken, openConnectListModal } = useAppStore.getState();
  if (!anilistToken && !malToken) { openConnectListModal(); return; }
}

function getStatusPill(status?: string): { label: string; className: string } | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s === "RELEASING" || s === "AIRING") return { label: "On-Going", className: "bg-emerald-500/15 text-emerald-400" };
  if (s === "FINISHED") return { label: "Finished", className: "bg-white/10 text-white/60" };
  if (s === "NOT_YET_RELEASED" || s === "NOT_YET_AIRED") return { label: "TBA", className: "bg-white/10 text-white/60" };
  if (s === "CANCELLED") return { label: "Cancelled", className: "bg-white/10 text-white/60" };
  if (s === "HIATUS") return { label: "Hiatus", className: "bg-white/10 text-white/60" };
  return { label: status, className: "bg-white/10 text-white/60" };
}

/* ═══════════════════════════════════════════════════════════════
   HERO CAROUSEL — Full-screen featured anime
   ═══════════════════════════════════════════════════════════════ */

function HeroCarousel({ items, navigate }: { items: FeaturedAnime[]; navigate: (r: any) => void }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [logos, setLogos] = useState<Record<number, string>>({});
  const [backdrops, setBackdrops] = useState<Record<number, string>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch TVDB clearlogos + backgrounds for the hero banners.
  // TVDB has the best anime clearlogos (transparent PNG logos like the
  // One Piece logo). Falls back to AniList banner if TVDB has no background.
  // Each TVDB API call has a 4s timeout to prevent Vercel function timeouts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const anime of items) {
        if (cancelled) return;
        if (logos[anime.id] || backdrops[anime.id]) continue;
        try {
          const title = getTitle(anime);
          const res = await fetch(`/api/anime/tmdb-images?anilistId=${anime.id}&title=${encodeURIComponent(title)}`);
          if (res.ok) {
            const data = await res.json();
            if (cancelled) return;
            if (data.logoUrl) setLogos(prev => ({ ...prev, [anime.id]: data.logoUrl }));
            if (data.backdropUrl) setBackdrops(prev => ({ ...prev, [anime.id]: data.backdropUrl }));
          }
        } catch { /* keep going to the next banner */ }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    if (paused || items.length === 0) return;
    timerRef.current = setTimeout(() => {
      setCurrent(prev => (prev + 1) % items.length);
    }, 8000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current, paused, items.length]);

  if (items.length === 0) {
    return (
      <div className="relative w-full h-[60dvh] bg-[#000000] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-white/10 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const anime = items[current];
  // Use TVDB backdrop if available, otherwise AniList banner
  const banner = backdrops[anime.id] || anime.bannerImage || getBanner(anime) || "";
  const logoUrl = logos[anime.id];
  const title = getTitle(anime);
  const score = getScore(anime);
  const seasonStr = anime.season && anime.seasonYear ? `${anime.season} ${anime.seasonYear}` : anime.seasonYear ? String(anime.seasonYear) : "";
  const description = anime.description ? String(anime.description || "").replace(/<[^>]*>/g, "") : "";

  return (
    <div
      className="relative w-full h-[55dvh] md:h-[62dvh] min-h-[380px] md:min-h-[440px] overflow-hidden bg-[#000000]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ── Banner image — full-bleed, object-cover for cinematic crop ── */}
      {banner && (
        <img
          src={banner}
          alt=""
          className="object-cover object-[center_30%] md:object-center"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", animation: "ltv-hero-crossfade 1.2s ease-in-out" }}
          key={`bg-${current}`}
          onError={(e) => {
            const fallback = anime.bannerImage || getBanner(anime) || "";
            const img = e.currentTarget;
            if (fallback && img.src !== fallback) img.src = fallback;
            else img.style.display = "none";
          }}
        />
      )}

      {/* ── Overlay system — matches the original cinematic look the user liked:
          strong vignette on all sides, bold left gradient for text column, dark
          top fade under header, and a solid bottom fade into the next section. */}
      {/* 1) Base wash — uniform darkening across entire banner */}
      <div className="absolute inset-0 bg-black/40" />
      {/* 2) Edge vignette — dark shadow on all 4 edges */}
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 220px 60px rgba(0,0,0,0.65)" }} />
      {/* 3) Left gradient — near-black at edge for text contrast */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.95) 0%, transparent 22%)" }} />
      {/* 4) Top fade — strong darkening under header */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 18%)" }} />
      {/* 5) Bottom fade — solid black at bottom edge to blend into section below */}
      <div className="absolute inset-x-0 bottom-0 h-20 md:h-32 bg-gradient-to-t from-black to-transparent" />

      {/* ── Content — bottom-left anchored, shiroko-style ── */}
      <div
        className="absolute inset-x-0 bottom-0 px-4 sm:px-6 lg:px-12 pb-4 sm:pb-8 lg:pb-10 pt-2 sm:pt-4"
        key={`content-${current}`}
        style={{ animation: "ltv-hero-content-slide 1.2s ease-out" }}
      >
        <div className="flex flex-col items-start gap-1 sm:gap-1.5 lg:w-[45%] text-white">
          {/* Trending badge */}
          <div className="capitalize font-karla flex items-center gap-1.5" style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.9))" }}>
            <Flame size={14} strokeWidth={1} className="text-red-500 fill-red-500 sm:text-[16px]" />
            <p className="text-[11px] sm:text-xs font-semibold tracking-wide">{ordinal(current + 1)} on trend</p>
          </div>

          {/* TITLE → logo art or plain text */}
          <div className="font-karla text-balance font-extrabold leading-6 sm:leading-8 xl:leading-10">
            {logoUrl ? (
              <img
                key={anime.id}
                src={logoUrl}
                alt={title}
                className="max-w-[120px] sm:max-w-[180px] lg:max-w-[240px] xl:max-w-[300px] max-h-[44px] sm:max-h-[60px] lg:max-h-[80px] w-auto h-auto object-contain"
                style={{ objectPosition: "left", filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.9))" }}
                draggable={false}
                onError={() => setLogos((prev) => { const n = { ...prev }; delete n[anime.id]; return n; })}
              />
            ) : (
              <h1 className="text-base sm:text-xl lg:text-2xl xl:text-3xl font-extrabold text-white leading-tight" style={{ textShadow: "0 4px 16px rgba(0,0,0,0.9)" }}>
                {title}
              </h1>
            )}
          </div>

          {/* Genre pills */}
          <div className="flex py-0.5 sm:py-1 gap-1 sm:gap-1.5 flex-wrap w-full text-white" style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.8))" }}>
            {anime.seasonYear && (
              <span className="border border-white/10 bg-[#ceced1]/10 text-[10px] sm:text-[11px] px-1.5 sm:px-2.5 py-0.5 rounded-full backdrop-blur-sm">{anime.seasonYear}</span>
            )}
            {anime.genres?.slice(0, 3).map(g => (
              <span key={g} className="border border-white/10 bg-[#ceced1]/10 text-[10px] sm:text-[11px] px-1.5 sm:px-2.5 py-0.5 rounded-full backdrop-blur-sm">{g}</span>
            ))}
          </div>

          {/* Description */}
          {description && (
            <div className="w-full max-w-lg relative font-karla font-light line-clamp-2 leading-4 sm:leading-5 text-white/70 text-[11px] sm:text-xs" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9)" }}>
              {description}
            </div>
          )}

          {/* Buttons — Watch Now + Add-to-list, consistent heights */}
          <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
            <button
              onClick={() => navigate({ page: "anime", id: String(anime.id) })}
              className="inline-flex items-center justify-center gap-1 whitespace-nowrap transition-all shrink-0 outline-none bg-white/95 text-slate-900 shadow-sm border border-slate-200/70 hover:bg-white h-7 sm:h-8 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full font-semibold text-[11px] sm:text-xs"
            >
              <Play size={11} strokeWidth={1} fill="currentColor" className="sm:text-[13px]" />
              Watch Now
            </button>

            <button
              onClick={(e) => handleAddToList(e, { id: anime.id, title, cover: getCover(anime) })}
              className="inline-flex items-center justify-center transition-all shrink-0 outline-none shadow-sm h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white border border-white/15"
              title="Add to list"
              aria-label="Add to list"
            >
              <Plus size={14} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation dots — hidden on mobile (overlaps button), visible sm+ */}
      <div className="hidden sm:flex absolute bottom-4 right-4 lg:right-12 items-center gap-1.5 z-30">
        {items.slice(0, 6).map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`h-0.5 rounded-full transition-all ${i === current ? "w-6 bg-white/90" : "w-1.5 bg-white/25 hover:bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   POSTER ROW — shared horizontal-scroll row of poster cards with
   status + episode-count pills. Used by Trending Anime + Popular Anime.
   ═══════════════════════════════════════════════════════════════ */

// Hover title-tint colors, cycled per card index (4-color loop) instead of
// the old flat white/uniform hover — each poster in the row gets its own hue.
const HOVER_TITLE_COLORS = ["#8FCBAE", "#84A8D1", "#C98DA8", "#9E8BC4"];

function PosterRow({ title, items, navigate }: {
  title: string;
  items: AnimeItem[];
  navigate: (r: any) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cards = items.slice(0, 10);

  if (cards.length === 0) return null;

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === "right" ? 700 : -700, behavior: "smooth" });
    }
  };

  return (
    <section className="px-4 md:px-8 lg:px-8 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2
          className="font-karla text-xl font-bold bg-clip-text text-transparent"
          style={{ backgroundImage: "linear-gradient(180deg, #ffffff 0%, #a3a3a3 100%)" }}
        >
          {title}
        </h2>
        <div className="flex gap-2">
          <button onClick={() => scroll("left")} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => scroll("right")} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
        {cards.map((anime, idx) => {
          const cover = getCover(anime);
          const cardTitle = getTitle(anime);
          const pill = getStatusPill(anime.status);
          const accent = HOVER_TITLE_COLORS[idx % HOVER_TITLE_COLORS.length];
          return (
            <div
              key={`${anime.id}-${idx}`}
              onClick={() => navigate({ page: "anime", id: String(anime.id) })}
              className="group shrink-0 text-left cursor-pointer"
              style={{ width: "190px", ["--accent" as any]: accent }}
            >
              <div className="relative w-full aspect-[2/3] bg-white/5 overflow-hidden ring-1 ring-transparent group-hover:ring-white/20 transition-all duration-300" style={{ borderRadius: "12px" }}>
                {cover ? (
                  <img src={cover} alt={cardTitle} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/10 font-bold text-2xl">{cardTitle.charAt(0)}</div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
                {/* Add button — fades in on hover */}
                <button
                  onClick={(e) => handleAddToList(e, { id: anime.id, title: cardTitle, cover })}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  title="Add to list"
                  aria-label="Add to list"
                >
                  <Plus size={14} strokeWidth={2} />
                </button>
              </div>
              {/* Title + status/episode pills below the card */}
              <div className="mt-2.5 space-y-1">
                <p className="text-[13px] font-medium text-white/90 leading-snug line-clamp-2 transition-colors duration-200 group-hover:text-[var(--accent)]">{cardTitle}</p>
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
  );
}

function TopTrending({ trending, navigate }: {
  trending: AnimeItem[];
  topRated: AnimeItem[];
  navigate: (r: any) => void;
}) {
  // Show only 5 trending anime — fits exactly before the Discord widget, no overlap
  const cards = trending.slice(0, 5);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (cards.length === 0) return null;

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === "right" ? 700 : -700, behavior: "smooth" });
    }
  };

  return (
    <section className="px-4 md:px-8 lg:px-8 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2
          className="font-karla text-xl font-bold bg-clip-text text-transparent"
          style={{ backgroundImage: "linear-gradient(180deg, #ffffff 0%, #a3a3a3 100%)" }}
        >
          Trending Anime
        </h2>
        <div className="flex gap-2">
          <button onClick={() => scroll("left")} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => scroll("right")} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
      {/* Flex container: anime cards on left, Discord widget on right */}
      <div className="flex gap-6 items-start">
        {/* Anime cards — left side */}
        <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2 flex-1" style={{ scrollbarWidth: "none" }}>
          {cards.map((anime, idx) => {
            const cover = getCover(anime);
            const cardTitle = getTitle(anime);
            const pill = getStatusPill(anime.status);
            const accent = HOVER_TITLE_COLORS[idx % HOVER_TITLE_COLORS.length];
            return (
              <div
                key={`${anime.id}-${idx}`}
                onClick={() => navigate({ page: "anime", id: String(anime.id) })}
                className="group shrink-0 text-left cursor-pointer"
                style={{ width: "180px", ["--accent" as any]: accent }}
              >
                <div className="relative w-full aspect-[2/3] bg-white/5 overflow-hidden ring-1 ring-transparent group-hover:ring-white/20 transition-all duration-300" style={{ borderRadius: "12px" }}>
                  {cover ? (
                    <img src={cover} alt={cardTitle} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/10 font-bold text-2xl">{cardTitle.charAt(0)}</div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
                  <button
                    onClick={(e) => handleAddToList(e, { id: anime.id, title: cardTitle, cover })}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    title="Add to list"
                    aria-label="Add to list"
                  >
                    <Plus size={14} strokeWidth={2} />
                  </button>
                </div>
                <div className="mt-2.5 space-y-1">
                  <p className="text-[13px] font-medium text-white/90 leading-snug line-clamp-2 transition-colors duration-200 group-hover:text-[var(--accent)]">{cardTitle}</p>
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
        {/* Discord widget — right side, inline (not floating) */}
        <div className="hidden lg:block shrink-0">
          <DiscordWidget />
        </div>
      </div>
    </section>
  );
}

function PopularAnime({ popular, navigate }: {
  popular: AnimeItem[];
  navigate: (r: any) => void;
}) {
  return <PosterRow title="Popular Anime" items={popular} navigate={navigate} />;
}

/* ═══════════════════════════════════════════════════════════════
   TRENDING MANGA — pulled from /api/manga/home, same poster-row look
   ═══════════════════════════════════════════════════════════════ */

interface MangaHomeItem {
  id: string;
  title: string;
  poster?: string;
  cover?: string;
  status?: string;
}

function getMangaStatusPill(status?: string): { label: string; className: string } | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s.includes("ongoing") || s.includes("releasing") || s.includes("airing")) {
    return { label: "On-Going", className: "bg-emerald-500/15 text-emerald-400" };
  }
  if (s.includes("complet") || s.includes("finish")) {
    return { label: "Finished", className: "bg-white/10 text-white/60" };
  }
  if (s.includes("hiatus")) return { label: "Hiatus", className: "bg-white/10 text-white/60" };
  if (s.includes("cancel")) return { label: "Cancelled", className: "bg-white/10 text-white/60" };
  return { label: status, className: "bg-white/10 text-white/60" };
}

function TrendingManga({ navigate }: { navigate: (r: any) => void }) {
  // REMOVED — manga section replaced by RecentlyReleased
  return null;
}

// ── RecentlyReleased — Anikura-style 16:9 cards with episode badges ──
// Shows currently airing anime with the latest episode info.
// Card layout matches Anikura:
//   1. 16:9 thumbnail with episode badge (pink, bottom-left)
//   2. Below thumbnail: SUB label + title
//   3. Play icon + view count + timestamp
//   4. "New" badge
function RecentlyReleased({ navigate, trending }: { navigate: (r: any) => void; trending: AnimeItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<AnimeItem[]>([]);

  useEffect(() => {
    // Filter trending to currently airing anime (status: RELEASING)
    const airing = (trending || []).filter(a =>
      a?.status === "RELEASING" ||
      a?.nextAiringEpisode
    ).slice(0, 15);

    if (airing.length > 0) {
      setItems(airing);
      return;
    }

    // Fallback: fetch from AniList directly
    (async () => {
      try {
        const res = await fetch("/api/anilist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `query {
              Page(page: 1, perPage: 15) {
                media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) {
                  id title { romaji english native }
                  coverImage { extraLarge large medium color }
                  bannerImage format status episodes genres
                  averageScore popularity season seasonYear
                  nextAiringEpisode { airingAt timeUntilAiring episode }
                }
              }
            }`,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const list = data?.data?.Page?.media || [];
          setItems(list);
        }
      } catch {}
    })();
  }, [trending]);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: dir === "left" ? -400 : 400,
      behavior: "smooth",
    });
  };

  // Format relative time from airingAt timestamp
  function formatTimeAgo(airingAt?: number): string {
    if (!airingAt) return "Recently";
    const diff = Date.now() / 1000 - airingAt;
    if (diff < 0) return "Upcoming";
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  }

  // Format view count from popularity
  function formatViews(popularity?: number): string {
    if (!popularity) return "New";
    if (popularity >= 1000000) return `${(popularity / 1000000).toFixed(1)}M`;
    if (popularity >= 1000) return `${(popularity / 1000).toFixed(1)}K`;
    return String(popularity);
  }

  if (items.length === 0) return null;

  return (
    <section className="py-6 px-4 md:px-8">
      {/* Header — Anikura style with accent bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-7 bg-gradient-to-b from-[var(--accent)] to-[var(--accent)]/50 rounded-full" />
          <div>
            <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
              Recently Released
            </h2>
            <p className="text-xs text-white/40">Fresh episodes from ongoing series</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll("left")}
            className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            onClick={() => scroll("right")}
            className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
      </div>

      {/* Cards — horizontal scroll */}
      <div
        ref={scrollRef}
        className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2"
      >
        {items.map((anime) => {
          const cover = anime?.coverImage?.extraLarge || anime?.coverImage?.large || anime?.bannerImage || "";
          const title = anime?.title?.english || anime?.title?.romaji || "Unknown";
          const ep = anime?.nextAiringEpisode?.episode || anime?.episodes || 1;
          const views = formatViews(anime?.popularity);
          const timeAgo = formatTimeAgo(anime?.nextAiringEpisode?.airingAt);

          return (
            <div
              key={anime.id}
              onClick={() => navigate({ page: "watch", id: String(anime.id), episode: ep })}
              className="group cursor-pointer flex-shrink-0 w-[220px] md:w-[260px]"
            >
              {/* ── 16:9 Thumbnail ── */}
              <div className="relative aspect-video rounded-lg overflow-hidden bg-white/5 border border-white/5 transition-all duration-300 group-hover:border-white/20 group-hover:shadow-2xl group-hover:shadow-black/50">
                {cover ? (
                  <img
                    src={cover}
                    alt={title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/10 text-4xl font-bold">{String(title).charAt(0)}</div>
                )}

                {/* Episode badge (bottom-left, subtle dark to match theme) */}
                <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="white/80"><path d="M8 5v14l11-7z" /></svg>
                  <span className="text-[10px] font-semibold text-white/80">EP {ep}</span>
                </div>
              </div>

              {/* ── Below thumbnail: text info (Anikura style) ── */}
              <div className="pt-2 px-0.5">
                {/* Line 1: SUB label + Title */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider shrink-0">SUB</span>
                  <h3 className="text-xs font-bold text-white line-clamp-1 leading-tight">{title}</h3>
                </div>

                {/* Line 2: Play icon + views + timestamp */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-white/30 shrink-0"><path d="M8 5v14l11-7z" /></svg>
                  <span className="text-[11px] text-white/40">{views}</span>
                  <span className="text-white/20">·</span>
                  <span className="text-[11px] text-white/40">{timeAgo}</span>
                </div>

                {/* Line 3: New badge */}
                <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded bg-white/5 text-white/50 border border-white/10">
                  New
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
/* ═══════════════════════════════════════════════════════════════
   MUST WATCH ANIME — curated editorial row, ambient color glow
   pulled from each anime's AniList palette color.
   ═══════════════════════════════════════════════════════════════ */

const TEXT_GRADIENT = "linear-gradient(180deg, #ffffff 0%, #a3a3a3 100%)";

/** Gradient-filled percentage text (replaces the old solid-gold score color). */
function GradientScore({ score, iconClassName, textClassName }: { score: number; iconClassName: string; textClassName: string }) {
  return (
    <span className="flex items-center gap-1">
      <svg className={iconClassName} fill="currentColor" viewBox="0 0 20 20" style={{ color: "#c9c9c9" }}>
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <span className={`${textClassName} bg-clip-text text-transparent`} style={{ backgroundImage: TEXT_GRADIENT }}>
        {score}%
      </span>
    </span>
  );
}

function MustWatchAnime({ topRated, navigate }: {
  topRated: AnimeItem[];
  navigate: (r: any) => void;
}) {
  const withBanner = topRated.filter(a => getBanner(a));
  const pool = withBanner.length >= 5 ? withBanner : topRated;
  const featured = pool[0];
  const rest = pool.slice(1, 6);

  const [tmdbBackdrop, setTmdbBackdrop] = useState("");

  useEffect(() => {
    if (!featured) return;
    let cancelled = false;
    setTmdbBackdrop("");
    (async () => {
      try {
        const title = getTitle(featured);
        const res = await fetch(`/api/anime/tmdb-images?anilistId=${featured.id}&title=${encodeURIComponent(title)}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.backdropUrl) setTmdbBackdrop(data.backdropUrl);
        }
      } catch { /* falls back to AniList banner */ }
    })();
    return () => { cancelled = true; };
  }, [featured]);

  if (pool.length === 0) return null;

  const featuredTitle = getTitle(featured);
  const featuredScore = getScore(featured);
  const featuredDesc = featured.description ? String(featured.description || "").replace(/<[^>]+>/g, "") : "";
  const featuredBg = tmdbBackdrop || getBanner(featured);

  return (
    <section className="px-4 md:px-8 lg:px-8 py-6">
      <div className="mb-5">
        <p className="font-karla text-[11px] font-bold uppercase tracking-[0.2em] text-white/40 mb-1.5">Top Selection</p>
        <h2
          className="font-karla text-2xl md:text-3xl font-extrabold bg-clip-text text-transparent"
          style={{ backgroundImage: TEXT_GRADIENT }}
        >
          Must Watch Anime
        </h2>
      </div>

      {/* Spotlight + ranked list — one large featured pick paired with a
          compact chart-style list, instead of another poster carousel. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-5">
        {/* ── Featured pick ── */}
        <button
          onClick={() => navigate({ page: "anime", id: String(featured.id) })}
          className="group relative text-left overflow-hidden w-full"
          style={{ minHeight: "360px", borderRadius: "18px" }}
        >
          {featuredBg ? (
            <img
              src={featuredBg}
              alt={featuredTitle}
              className="object-cover transition-transform duration-700 group-hover:scale-105"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              loading="lazy"
              key={featuredBg}
            />
          ) : (
            <div className="absolute inset-0 bg-white/5" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />

          <div className="relative h-full flex flex-col justify-end p-6 md:p-8" style={{ minHeight: "360px" }}>
            <span className="inline-flex w-fit items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 text-white/70 border border-white/15 mb-3 backdrop-blur-sm">
              #1 Pick
            </span>
            <h3
              className="font-karla text-2xl md:text-4xl font-extrabold leading-tight drop-shadow-lg max-w-lg bg-clip-text text-transparent"
              style={{ backgroundImage: TEXT_GRADIENT }}
            >
              {featuredTitle}
            </h3>
            <div className="flex items-center gap-3 mt-3 text-xs text-white/60">
              <span>{featured.format || "TV"}{featured.episodes ? ` · ${featured.episodes} eps` : ""}{featured.seasonYear ? ` · ${featured.seasonYear}` : ""}</span>
              {featuredScore > 0 && (
                <GradientScore score={featuredScore} iconClassName="w-3.5 h-3.5" textClassName="text-sm font-bold" />
              )}
            </div>
            {featuredDesc && (
              <p className="text-sm text-white/50 mt-3 line-clamp-2 max-w-md">{featuredDesc}</p>
            )}
            <div className="flex items-center gap-3 mt-5">
              <span className="inline-flex items-center gap-2 whitespace-nowrap bg-white/95 text-slate-900 h-9 px-4 rounded-full font-semibold text-sm group-hover:bg-white transition-colors">
                <Play size={14} strokeWidth={1} fill="currentColor" />
                Watch Now
              </span>
            </div>
          </div>
        </button>

        {/* ── Ranked list — remaining picks ── */}
        <div className="flex flex-col divide-y divide-white/[0.06]">
          {rest.map((anime, idx) => {
            const cover = getCover(anime);
            const title = getTitle(anime);
            const score = getScore(anime);
            return (
              <button
                key={`${anime.id}-${idx}`}
                onClick={() => navigate({ page: "anime", id: String(anime.id) })}
                className="group flex items-center gap-3 py-3 text-left hover:bg-white/[0.03] px-2 -mx-2 rounded-lg transition-colors"
              >
                <span className="font-karla text-lg font-extrabold text-white/20 w-6 shrink-0 text-center">
                  {idx + 2}
                </span>
                <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-white/5">
                  {cover ? (
                    <img src={cover} alt={title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/10 font-bold text-sm">{title.charAt(0)}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-karla text-sm font-semibold text-white line-clamp-1 group-hover:text-[#D4A017] transition-colors">{title}</p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {anime.format || "TV"}{anime.seasonYear ? ` · ${anime.seasonYear}` : ""}
                  </p>
                </div>
                {score > 0 && (
                  <GradientScore score={score} iconClassName="w-3 h-3" textClassName="text-[11px] font-bold" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GENRE STRIP — quick-jump pills, each one deep-links into Browse
   ═══════════════════════════════════════════════════════════════ */

const GENRE_STRIP = [
  "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror",
  "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance",
  "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller",
];

/* ═══════════════════════════════════════════════════════════════
   GENRE SPOTLIGHT — wide 16:9 banner rail for one featured genre.

   Uses AniList `bannerImage` (the wide character key-art) rather than the
   portrait cover, so each card reads as a scene instead of a poster. The
   /api/anime/genre endpoint can't back this — it returns allanime-shaped
   rows with no banner field — so this pulls from /api/anime/browse, which
   is AniList-backed and returned a banner for all 12 results when checked.

   The featured genre rotates by day so the home page isn't static, and the
   arrows let you page through the rail like the other rows.
   ═══════════════════════════════════════════════════════════════ */

const SPOTLIGHT_GENRES = [
  "Slice of Life", "Action", "Romance", "Fantasy", "Comedy",
  "Adventure", "Drama", "Supernatural", "Mystery", "Sci-Fi",
];

function GenreSpotlight({ navigate }: { navigate: (r: any) => void }) {
  // genre + items land together so the heading never shows a genre whose rail
  // hasn't loaded. Both are set from the async callback rather than
  // synchronously in the effect body, which avoids a cascading re-render.
  const [data, setData] = useState<{ genre: string; items: any[] }>({ genre: "", items: [] });
  const [loading, setLoading] = useState(true);
  // TMDB clear-logo (transparent PNG) + clean backdrop per anime, same source
  // the hero carousel uses.
  const [art, setArt] = useState<Record<number, { logo?: string; backdrop?: string }>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const { genre, items } = data;

  useEffect(() => {
    let cancelled = false;
    // Chosen inside the effect (not at render) so server and client can't
    // disagree on the date and trip a hydration mismatch.
    const dayIndex = Math.floor(Date.now() / 86_400_000);
    const picked = SPOTLIGHT_GENRES[dayIndex % SPOTLIGHT_GENRES.length];

    fetch(`/api/anime/browse?genre=${encodeURIComponent(picked)}&sort=most-popular&perPage=14`)
      .then(r => (r.ok ? r.json() : null))
      .then(res => {
        if (cancelled) return;
        // Only keep entries that actually have wide art — a cover stretched to
        // 16:9 looks broken, and a blank tile looks worse.
        const withBanner = (res?.results || []).filter((a: any) => !!a?.bannerImage);
        setData({ genre: picked, items: withBanner.slice(0, 12) });
      })
      .catch(() => { /* best-effort — section hides itself if nothing loads */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  // Pull the show's logo + a clean backdrop once the rail has its items.
  // Sequential on purpose: TMDB is rate-limited and this is decoration, so it
  // must never contend with the streams/metadata calls the page actually needs.
  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const anime of items) {
        if (cancelled) return;
        if (art[anime.id]) continue;
        try {
          const res = await fetch(`/api/anime/tmdb-images?anilistId=${anime.id}&title=${encodeURIComponent(getTitle(anime))}`);
          if (!res.ok) continue;
          const d = await res.json();
          if (cancelled) return;
          if (d.logoUrl || d.backdropUrl) {
            setArt(prev => ({ ...prev, [anime.id]: { logo: d.logoUrl || undefined, backdrop: d.backdropUrl || undefined } }));
          }
        } catch { /* skip this one, keep going */ }
      }
    })();
    return () => { cancelled = true; };
  }, [items]);

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "right" ? 700 : -700, behavior: "smooth" });
  };

  // Nothing to show and nothing pending — render no empty shell.
  if (!loading && items.length === 0) return null;

  return (
    <section className="px-4 md:px-8 lg:px-8 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2
          className="font-karla text-xl font-bold bg-clip-text text-transparent"
          style={{ backgroundImage: "linear-gradient(180deg, #ffffff 0%, #a3a3a3 100%)" }}
        >
          {genre ? `Genre: ${genre}` : "Genre Spotlight"}
        </h2>
        <div className="flex gap-2">
          <button onClick={() => scroll("left")} aria-label="Scroll left" className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => scroll("right")} aria-label="Scroll right" className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={`sk-${i}`} className="shrink-0 rounded-lg bg-white/[0.04] animate-pulse" style={{ width: "min(80vw, 560px)", aspectRatio: "16 / 9" }} />
            ))
          : items.map((anime, idx) => {
              const cardTitle = getTitle(anime);
              const logo = art[anime.id]?.logo;
              const backdrop = art[anime.id]?.backdrop;
              return (
                <div
                  key={`${anime.id}-${idx}`}
                  onClick={() => navigate({ page: "anime", id: String(anime.id) })}
                  className="group shrink-0 cursor-pointer relative overflow-hidden rounded-lg ring-1 ring-white/[0.08]"
                  style={{ width: "min(80vw, 560px)", aspectRatio: "16 / 9" }}
                >
                  {/* When TMDB gives us a logo we also swap in its backdrop:
                      AniList banners often already have the show's wordmark
                      burned into them, and stacking our logo on top of that
                      would double it. TMDB backdrops are clean art. */}
                  {/* Only the banner zooms on hover. The logo, scrim and title
                      stay put — scaling the whole card made the logo drift and
                      the text swim. overflow-hidden on the wrapper clips it. */}
                  <img
                    src={(logo && backdrop) ? backdrop : anime.bannerImage}
                    alt={cardTitle}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                  />
                  {/* Bottom scrim so the title stays readable over bright art. */}
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />

                  {/* Centred clear-logo — the focal point, as in the reference */}
                  {logo && (
                    <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
                      <img
                        src={logo}
                        alt={cardTitle}
                        loading="lazy"
                        draggable={false}
                        className="max-w-[62%] max-h-[42%] w-auto h-auto object-contain"
                        style={{ filter: "drop-shadow(0 4px 18px rgba(0,0,0,0.85))" }}
                        onError={() => setArt(prev => {
                          const n = { ...prev };
                          if (n[anime.id]) n[anime.id] = { ...n[anime.id], logo: undefined };
                          return n;
                        })}
                      />
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <h3 className="font-karla text-[13px] sm:text-sm font-bold text-white line-clamp-1 drop-shadow-lg">
                      {cardTitle}
                    </h3>
                  </div>
                </div>
              );
            })}
      </div>
    </section>
  );
}

function GenreStrip({ navigate }: { navigate: (r: any) => void }) {
  const setSectionSubPage = useAppStore(s => s.setSectionSubPage);

  const goToBrowse = () => {
    navigate({ page: "home" });
    setSectionSubPage("browse");
  };

  return (
    <section className="px-4 md:px-8 lg:px-8 py-4">
      {/* Individual square-ish chips, each with a clearly visible box */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {GENRE_STRIP.map(genre => (
          <button
            key={genre}
            onClick={goToBrowse}
            className="shrink-0 whitespace-nowrap px-4 py-2 rounded-md text-sm font-semibold bg-black/60 border border-white/15 text-white/80 hover:border-[#D4A017]/50 hover:text-[#D4A017] transition-colors"
          >
            {genre}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CONTINUE WATCHING — From history
   ═══════════════════════════════════════════════════════════════ */

function ContinueWatching({ navigate }: { navigate: (r: any) => void }) {
  const history = useAppStore(s => s.history);
  const recent = history.slice(0, 10);

  if (recent.length === 0) return null;

  return (
    <section className="px-4 md:px-8 lg:px-8 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2
          className="font-karla text-xl font-bold bg-clip-text text-transparent"
          style={{ backgroundImage: TEXT_GRADIENT }}
        >
          Continue Watching
        </h2>
        <button
          onClick={() => navigate({ page: "history" })}
          className="text-xs text-white/40 hover:text-white transition-colors"
        >
          View All
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
        {recent.map(h => {
          const progressPercent = h.duration > 0 ? Math.min((h.progress / h.duration) * 100, 100) : (h.progress || 0);
          const remainingMin = h.duration > 0 ? Math.max(0, Math.round((h.duration - (h.progress / 100) * h.duration) / 60)) : 0;
          return (
            <button
              key={h.animeId + h.episodeNum}
              onClick={() => navigate({ page: "watch", id: h.animeId, episode: h.episodeNum, title: h.animeName, image: h.thumbnail })}
              className="group shrink-0 w-[300px] text-left"
            >
              <div className="relative w-full aspect-video overflow-hidden" style={{ borderRadius: "8px" }}>
                {h.thumbnail && (
                  <img src={h.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                {/* Play button overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center">
                    <svg className="w-6 h-6 text-black ml-1" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
                  <div className="h-full bg-white" style={{ width: `${progressPercent}%` }} />
                </div>
                {/* Episode badge */}
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/80 backdrop-blur-sm text-[10px] font-bold text-white" style={{ borderRadius: "3px" }}>
                  EP {h.episodeNum}
                </div>
              </div>
              <div className="mt-2.5">
                <p className="text-sm font-semibold text-white truncate group-hover:text-white/80 transition-colors">{h.animeName}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs font-medium text-white/60">Episode {h.episodeNum}</p>
                  <p className="text-xs text-white/30">
                    {progressPercent > 0 ? `${Math.round(progressPercent)}%` : "Just started"}
                    {remainingMin > 0 && progressPercent < 95 ? ` · ${remainingMin}m left` : ""}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   POSTER CARD — Used in carousels
   ═══════════════════════════════════════════════════════════════ */

function PosterCard({ anime, navigate }: { anime: AnimeItem; navigate: (r: any) => void }) {
  const cover = getCover(anime);
  const title = getTitle(anime);
  const score = getScore(anime);
  const accent = HOVER_TITLE_COLORS[anime.id % HOVER_TITLE_COLORS.length];

  return (
    <div
      onClick={() => navigate({ page: "anime", id: String(anime.id) })}
      className="group shrink-0 w-[190px] text-left cursor-pointer"
      style={{ ["--accent" as any]: accent }}
    >
      <div className="relative w-full aspect-[2/3] bg-white/5 overflow-hidden ring-1 ring-transparent group-hover:ring-white/20 transition-all duration-300" style={{ borderRadius: "12px" }}>
        {cover ? (
          <img src={cover} alt={title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/10 font-bold text-2xl">{title.charAt(0)}</div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
        {/* Score badge — bottom-left */}
        {score > 0 && (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/80 backdrop-blur-sm text-xs font-bold text-white rounded-md">
            ★ {score}%
          </div>
        )}
        {/* Add button — fades in on hover */}
        <button
          onClick={(e) => handleAddToList(e, { id: anime.id, title, cover })}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          title="Add to list"
          aria-label="Add to list"
        >
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="mt-2.5 space-y-1">
        <p className="text-[13px] font-medium text-white/90 leading-snug line-clamp-2 transition-colors duration-200 group-hover:text-[var(--accent)]">{title}</p>
        <div className="flex items-center gap-1.5 text-[11px] text-white/40">
          {anime.seasonYear && <span>{anime.seasonYear}</span>}
          {anime.episodes && <span>· {anime.episodes} eps</span>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HORIZONTAL CAROUSEL — Section with title + scrollable posters
   ═══════════════════════════════════════════════════════════════ */

function Carousel({ title, subtitle, items, navigate }: {
  title: string;
  subtitle?: string;
  items: AnimeItem[];
  navigate: (r: any) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      const amount = 600;
      scrollRef.current.scrollBy({ left: dir === "right" ? amount : -amount, behavior: "smooth" });
    }
  };

  if (items.length === 0) return null;

  return (
    <section className="px-4 md:px-8 lg:px-8 py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2
            className="font-karla text-xl font-bold bg-clip-text text-transparent"
            style={{ backgroundImage: TEXT_GRADIENT }}
          >
            {title}
          </h2>
          {subtitle && <p className="text-sm text-white/40 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => scroll("left")} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => scroll("right")} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
        {items.map(a => (
          <PosterCard key={a.id} anime={a} navigate={navigate} />
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   COMING SOON — Upcoming anime
   ═══════════════════════════════════════════════════════════════ */

function ComingSoon({ items, navigate }: { items: AnimeItem[]; navigate: (r: any) => void }) {
  const [extra, setExtra] = useState<AnimeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Always fetch a dedicated batch of upcoming anime so the section is never
  // empty / too short (trending list rarely has NOT_YET_RELEASED).
  //
  // Strategy:
  //   1. Try AniList directly (fastest path when AniList is up)
  //   2. If AniList is down, fall back to /api/anime/home which has an
  //      `upcoming` section sourced from our 20K-anime SQLite DB
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Try AniList first
        const res = await fetch("/api/anilist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `
              query {
                Page(page: 1, perPage: 30) {
                  media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC, isAdult: false) {
                    id title { romaji english native }
                    coverImage { extraLarge large medium color }
                    bannerImage format status episodes genres
                    averageScore popularity season seasonYear
                    description(asHtml: false)
                    startDate { year month day }
                  }
                }
              }
            `,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            const list: AnimeItem[] = (data?.data?.Page?.media || []).map((a: any) => ({
              ...a,
              id: a.id,
            }));
            if (list.length > 0) {
              setExtra(list);
              setLoading(false);
              return;
            }
          }
        }
      } catch {}

      // ── FALLBACK: AniList down — use /api/anime/home which sources from SQLite ──
      if (cancelled) return;
      try {
        const homeRes = await fetch("/api/anime/home");
        if (homeRes.ok) {
          const homeData = await homeRes.json();
          const upcoming = homeData?.upcoming || [];
          if (upcoming.length > 0) {
            const list: AnimeItem[] = upcoming.map((a: any) => ({
              ...a,
              id: a.id,
            }));
            setExtra(list);
            setLoading(false);
            return;
          }
        }
      } catch {}

      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Merge: any upcoming from trending + dedicated AniList fetch, dedupe by id
  const fromTrending = items.filter(a => a.status === "NOT_YET_RELEASED");
  const seen = new Set<number>();
  const merged: AnimeItem[] = [];
  for (const a of [...fromTrending, ...extra]) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      merged.push(a);
    }
  }

  if (loading && merged.length === 0) {
    // Show skeleton placeholders while loading
    return (
      <section className="px-4 md:px-8 lg:px-8 py-4">
        <h2
          className="font-karla text-xl font-bold bg-clip-text text-transparent mb-4"
          style={{ backgroundImage: TEXT_GRADIENT }}
        >
          Coming Soon
        </h2>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[170px] md:w-[185px]">
              <div className="w-full aspect-[3/4] bg-white/5 rounded animate-pulse" />
              <div className="h-3 w-3/4 bg-white/5 rounded mt-2 animate-pulse" />
              <div className="h-2 w-1/2 bg-white/5 rounded mt-1 animate-pulse" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (merged.length === 0) return null;

  return (
    <Carousel
      title="Coming Soon"
      items={merged}
      navigate={navigate}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   RECENT COMMENTS — Community discussion from all anime
   ═══════════════════════════════════════════════════════════════ */

// Placeholder comments shown until real ones exist — swapped out
// automatically once the API/local store returns actual comments.
const FAKE_COMMENTS = [
  { id: "fake-1", username: "Fundraizer", createdAt: new Date(Date.now() - 60 * 60000).toISOString(), episode: 12, content: "This pose is so tuff", animeTitle: "The Irregular at Magic High School", animeId: "20507", likes: 3 },
  { id: "fake-2", username: "HakariFXX", createdAt: new Date(Date.now() - 60 * 60000).toISOString(), episode: 7, content: "Himeko is badder than Haruki", animeTitle: "Tenkousei no Seiei Karen na", animeId: "", likes: 0 },
  { id: "fake-3", username: "tacochoice", createdAt: new Date(Date.now() - 3 * 60 * 60000).toISOString(), episode: 18, content: "why is almight caked up", animeTitle: "My Hero Academia", animeId: "21459", likes: 7 },
  { id: "fake-4", username: "tacochoice", createdAt: new Date(Date.now() - 3 * 60 * 60000).toISOString(), episode: 4, content: "HOLY PEAK", animeTitle: "My Hero Academia", animeId: "21459", likes: 12 },
];

function RecentComments({ navigate, trending }: { navigate: (r: any) => void; trending: AnimeItem[] }) {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === "right" ? 700 : -700, behavior: "smooth" });
    }
  };

  // Pick a stable pseudo-random anime cover for a comment's avatar (decorative —
  // comments don't carry a user profile picture, so we borrow an anime poster).
  const randomAvatar = (seed: string) => {
    const pool = trending.filter(a => getCover(a));
    if (pool.length === 0) return "";
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return getCover(pool[hash % pool.length]);
  };

  useEffect(() => {
    let cancelled = false;

    // 1. Load local comments (instant, works on Vercel where SQLite is read-only)
    const LOCAL_KEY = "luffytv_comments";
    const localAll: any[] = [];
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null) {
          for (const animeId of Object.keys(parsed)) {
            for (const c of parsed[animeId] || []) {
              localAll.push({ ...c, animeId });
            }
          }
        }
      }
    } catch {}
    localAll.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const localTop = localAll.slice(0, 5).filter(c => c.id && c.id !== "0");

    // 2. Try server API for shared comments (in case DB is configured)
    fetch("/api/comments/recent?limit=5")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return;
        const serverComments = (data?.comments || []).filter((c: any) => c && c.id && c.id !== "0");
        const seen = new Set<string>();
        const merged: any[] = [];
        for (const c of [...localTop, ...serverComments]) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            merged.push(c);
          }
        }
        merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setComments(merged.slice(0, 5));
      })
      .catch(() => {
        if (!cancelled) setComments(localTop);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const datePart = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
    const timePart = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    return `${datePart}, ${timePart}`;
  };

  const display = loading ? [] : (comments.length > 0 ? comments : FAKE_COMMENTS);

  return (
    <section className="px-4 md:px-8 lg:px-8 py-6">
      {/* Header — neutral accent bar + gradient title, matching the rest of the page */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-white/30" />
          <h2
            className="font-karla text-2xl font-extrabold bg-clip-text text-transparent"
            style={{ backgroundImage: TEXT_GRADIENT }}
          >
            Latest Comments
          </h2>
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#E63946]/10 border border-[#E63946]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E63946] animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#E63946]">Live</span>
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => scroll("left")} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => scroll("right")} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[300px] border border-white/10 bg-white/[0.02] p-4 animate-pulse" style={{ minHeight: "150px" }} />
          ))}
        </div>
      ) : (
        /* ── Single horizontal scroll row, art bleeding in from the right
            edge of each card — matches the reference design. ── */
        <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {display.map((c: any) => {
            const avatar = randomAvatar(c.id || c.username || "x");
            const art = randomAvatar((c.id || c.username || "x") + "-art");
            return (
              <button
                key={c.id}
                onClick={() => c.animeId && navigate({ page: "anime", id: c.animeId })}
                className="group relative shrink-0 w-[300px] text-left overflow-hidden border border-white/15 hover:border-white/30 bg-[#0d0d0d] transition-colors p-4"
              >
                {/* Art bleeding in from the right edge, faded into the card */}
                {art && (
                  <>
                    <img
                      src={art}
                      alt=""
                      className="absolute inset-y-0 right-0 w-28 object-cover opacity-40"
                      loading="lazy"
                    />
                    <div className="absolute inset-y-0 right-0 w-28" style={{ background: "linear-gradient(to right, #0d0d0d 0%, transparent 60%)" }} />
                  </>
                )}

                <div className="relative">
                  {/* Row 1: avatar + username */}
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 shrink-0 overflow-hidden">
                      {avatar ? (
                        <img src={avatar} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-xs font-bold text-white/60">{(c.username || "A")[0].toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-white truncate">{c.username || "Anonymous"}</p>
                  </div>

                  {/* Row 2: chapter/episode + anime title */}
                  <p className="text-[11px] text-white/50 mb-2.5 truncate pl-[34px]">
                    {c.episode != null && Number(c.episode) > 0 ? `Ch ${c.episode} · ` : ""}{c.animeTitle || "Untitled"}
                  </p>

                  {/* Row 3: comment quote — italic, medium weight */}
                  <p className="text-sm font-medium italic text-white/90 leading-snug mb-3 max-w-[85%]">
                    &ldquo;{c.content}&rdquo;
                  </p>

                  {/* Row 4: like + count + date */}
                  <div className="flex items-center gap-1.5 text-white/50">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
                    </svg>
                    <span className="text-xs">{c.likes || 0}</span>
                    <span className="text-[11px]">·</span>
                    <span className="text-[11px]">{formatDateTime(c.createdAt)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MOST WATCHED ANIME + AIRING SCHEDULE — side by side, half/half
   ═══════════════════════════════════════════════════════════════ */

const RANK_COLORS: Record<number, string> = {
  1: "#D4A017",
  2: "#E5E5E5",
  3: "#C67C3E",
};

function MostWatchedAnime({ items, navigate }: { items: AnimeItem[]; navigate: (r: any) => void }) {
  const ranked = [...items].sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 10);
  if (ranked.length === 0) return null;

  return (
    <div>
      <h2
        className="font-karla text-lg font-extrabold bg-clip-text text-transparent mb-3"
        style={{ backgroundImage: TEXT_GRADIENT }}
      >
        Most Watched Anime
      </h2>
      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
        {ranked.map((anime, idx) => {
          const rank = idx + 1;
          const title = getTitle(anime);
          const cover = getCover(anime);
          return (
            <button
              key={anime.id}
              onClick={() => navigate({ page: "anime", id: String(anime.id) })}
              className="w-full flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-colors p-2 text-left"
            >
              <span
                className="text-base font-extrabold w-8 shrink-0 text-center"
                style={{ color: RANK_COLORS[rank] || "rgba(255,255,255,0.35)" }}
              >
                #{rank}
              </span>
              <div className="w-11 h-11 overflow-hidden shrink-0 bg-white/5">
                {cover ? (
                  <img src={cover} alt={title} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/10 font-bold">{title.charAt(0)}</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-white truncate">{title}</p>
                <p className="text-[11px] text-white/40 mt-0.5">Episode 1</p>
              </div>
              <span className="shrink-0 px-2 py-1 bg-white text-slate-900 text-[11px] font-extrabold">
                {formatCount(anime.popularity)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AiringScheduleWidget({ navigate }: { navigate: (r: any) => void }) {
  const [days, setDays] = useState<string[]>([]);
  const [dayLabels, setDayLabels] = useState<Record<string, string>>({});
  const [schedule, setSchedule] = useState<Record<string, any[]>>({});
  const [activeDay, setActiveDay] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/anime/anilist-schedule");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setDays(data.days || []);
        setDayLabels(data.dayLabels || {});
        setSchedule(data.schedule || {});
        if (data.days?.length > 0) setActiveDay(data.days[0]);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const items = (schedule[activeDay] || [])
    .slice()
    .sort((a, b) => a.airingAt - b.airingAt)
    .slice(0, 12);
  const activeDate = activeDay.split("|")[1];

  return (
    <div>
      <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1">Estimated</p>
      <h2
        className="font-karla text-lg font-extrabold bg-clip-text text-transparent mb-3"
        style={{ backgroundImage: TEXT_GRADIENT }}
      >
        Airing Schedule
      </h2>

      {/* Day tabs — "/ Wed / Thu / Fri /" style, current day emphasized */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-1" style={{ scrollbarWidth: "none" }}>
        <span className="text-white/15 text-base shrink-0">/</span>
        {days.map(dayKey => {
          const label = (dayLabels[dayKey] || "").slice(0, 3);
          const isActive = dayKey === activeDay;
          return (
            <button
              key={dayKey}
              onClick={() => setActiveDay(dayKey)}
              className={`shrink-0 transition-all ${isActive ? "text-white text-lg font-extrabold" : "text-white/30 text-sm font-semibold hover:text-white/60"}`}
            >
              {label}
            </button>
          );
        })}
        <span className="text-white/15 text-base shrink-0">/</span>
      </div>
      {activeDate && (
        <p className="text-[11px] text-white/40 mb-3">
          {new Date(activeDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
      )}

      <div className="space-y-0.5 max-h-[400px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-white/[0.02] animate-pulse" />
          ))
        ) : items.length === 0 ? (
          <p className="text-xs text-white/30 py-6 text-center">No episodes airing this day</p>
        ) : (
          items.map((s: any) => {
            const media = s.media;
            if (!media) return null;
            const title = getTitle(media);
            const time = new Date(s.airingAt * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
            return (
              <button
                key={`${media.id}-${s.episode}`}
                onClick={() => navigate({ page: "anime", id: String(media.id) })}
                className="w-full flex items-center gap-3 hover:bg-white/[0.04] transition-colors px-2 py-2 text-left"
              >
                <span className="text-[13px] text-white/50 w-12 shrink-0">{time}</span>
                <span className="text-[13px] text-white/85 truncate flex-1">{title}</span>
                <span className="shrink-0 px-1.5 py-0.5 border border-white/15 text-[10px] font-semibold text-white/70">
                  EP {s.episode}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function AnimeSectionPage() {
  const navigate = useAppStore(s => s.navigate);
  const sectionSubPage = useAppStore(s => s.sectionSubPage);
  const setSectionSubPage = useAppStore(s => s.setSectionSubPage);

  const [loading, setLoading] = useState(true);
  const [featured, setFeatured] = useState<FeaturedAnime[]>([]);
  const [trending, setTrending] = useState<AnimeItem[]>([]);
  const [popular, setPopular] = useState<AnimeItem[]>([]);
  const [topRated, setTopRated] = useState<AnimeItem[]>([]);

  // Fetch all data on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Fetch trending + popular separately (different anime sets)
        const res = await fetch("/api/anime/anilist-trending?section=all");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        // Dedupe by ID AND by base title (remove "Season X" suffix for comparison)
        const dedupe = (arr: any[]) => {
          const seenIds = new Set();
          const seenTitles = new Set();
          return arr.filter(a => {
            if (!a?.id) return false;
            // Dedupe by ID
            if (seenIds.has(a.id)) return false;
            seenIds.add(a.id);
            // Dedupe by base title (e.g. "Wistoria Season 2" and "Wistoria Season 3" = same base)
            const title = getTitle(a).toLowerCase().replace(/\s*(season|cour|part)\s*\d+/gi, "").replace(/:\s*.*/g, "").trim();
            if (title && seenTitles.has(title)) return false;
            seenTitles.add(title);
            return true;
          });
        };

        // Filter out Wistoria Season 3 from featured carousel (user request)
        const isWistoriaSeason3 = (a: any) => {
          const title = getTitle(a).toLowerCase();
          if (!title.includes("wistoria")) return false;
          // Match any form of season 3 marking
          return (
            /\bseason\s*3\b/i.test(title) ||
            /\bcour\s*3\b/i.test(title) ||
            /\bpart\s*3\b/i.test(title) ||
            /\biii\b/i.test(title) ||
            /\b3rd\b/i.test(title) ||
            /\bvol\.?\s*3\b/i.test(title) ||
            /\bs3\b/i.test(title)
          );
        };

        // Dedupe, then strip out Wistoria Season 3 entirely from the home page
        // (banner carousel, Trending Now, Discover, Sidebar — everywhere on home)
        let trend = dedupe(data.trending || []);
        // Popular uses its own separate data (different anime set from trending)
        let popularData = dedupe(data.popular || trend);
        // Remove overlap: exclude any anime already shown in Trending
        const trendingIds = new Set(trend.map(a => a.id));
        popularData = popularData.filter(a => !trendingIds.has(a.id));
        // If popular data is empty after dedup, fall back to trending with offset
        if (popularData.length < 5) popularData = trend.slice(10, 30);
        trend = trend.filter(a => !isWistoriaSeason3(a));

        // Featured carousel: famous anime with description + banner image.
        // The trending API races AniList / Miruro / MAL, so items may arrive
        // as AniList IDs (with descriptions) OR MAL IDs (without). We backfill
        // descriptions/banners from AniList for EVERY candidate missing them —
        // querying by BOTH id_in and idMal_in so it works regardless of which
        // source won the race. This fixes banners that showed only a title
        // (no logo, no description) after the first few slides.
        const topCandidates = trend.slice(0, 20);  // check top 20, pick best 8
        const idsToFetch = topCandidates
          .filter(a => !a?.description || !(a?.bannerImage || a?.coverImage?.extraLarge))
          .map(a => a.id)
          .filter(Boolean)
          .slice(0, 20);

        if (idsToFetch.length > 0) {
          try {
            const descRes = await fetch("/api/anilist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                // Match on AniList id OR MAL id — merge whichever matches.
                query: `query($ids:[Int]){Page(page:1,perPage:50){media(id_in:$ids,type:ANIME){id idMal title{romaji english} description(asHtml:false) episodes averageScore genres format season seasonYear status bannerImage coverImage{extraLarge large}} byMal:media(idMal_in:$ids,type:ANIME){id idMal description(asHtml:false) episodes averageScore genres format season seasonYear status bannerImage coverImage{extraLarge large}}}}`,
                variables: { ids: idsToFetch },
              }),
            });
            if (descRes.ok) {
              const descData = await descRes.json();
              const byId = descData?.data?.Page?.media || [];
              const byMal = descData?.data?.Page?.byMal || [];
              // Index by both AniList id and MAL id so our candidate's `id`
              // (which could be either) resolves regardless of source.
              const map = new Map<number, any>();
              for (const m of [...byId, ...byMal]) {
                if (m.id) map.set(m.id, m);
                if (m.idMal) map.set(m.idMal, m);
              }
              topCandidates.forEach(a => {
                const al = map.get(a.id);
                if (!al) return;
                if (!a.description && al.description) a.description = al.description;
                if (!a.episodes && al.episodes) a.episodes = al.episodes;
                if (!a.averageScore && al.averageScore) a.averageScore = al.averageScore;
                if ((!a.genres || a.genres.length === 0) && al.genres) a.genres = al.genres;
                if (!a.format && al.format) a.format = al.format;
                if (!a.season && al.season) a.season = al.season;
                if (!a.seasonYear && al.seasonYear) a.seasonYear = al.seasonYear;
                if (!a.status && al.status) a.status = al.status;
                if (!a.bannerImage && al.bannerImage) a.bannerImage = al.bannerImage;
                if (!a.coverImage && al.coverImage) a.coverImage = al.coverImage;
              });
            }
          } catch (e) {
            console.error("Failed to backfill featured descriptions:", e);
          }
        }

        // Keep only banners that have BOTH a real description and a banner
        // image — so the carousel never shows a bare title-only slide.
        const featuredCandidates = topCandidates.filter(a => {
          const hasDesc = a?.description && String(a.description || "").replace(/<[^>]*>/g, "").trim().length >= 50;
          const hasBanner = a?.bannerImage || a?.coverImage?.extraLarge || a?.coverImage?.large;
          return hasDesc && hasBanner;
        });

        // Featured = only complete items. If the backfill totally failed
        // (e.g. AniList fully down), fall back to anything with a banner
        // rather than showing an empty carousel.
        let finalFeatured: FeaturedAnime[] = [];
        if (featuredCandidates.length > 0) finalFeatured = featuredCandidates.slice(0, 8);
        else if (trend.length > 0) finalFeatured = trend.filter(a => a?.bannerImage || a?.coverImage?.extraLarge).slice(0, 8);

        // One Piece permanent first banner with TVDB background art
        const ONE_PIECE_TVDB_BG = "https://artworks.thetvdb.com/banners/v4/series/81797/backgrounds/616009a8bd688.jpg";
        const onePieceFromList = finalFeatured.find(a => a.id === 21) || trend.find(a => a.id === 21);
        const onePieceBanner: FeaturedAnime = onePieceFromList
          ? { ...onePieceFromList, bannerImage: ONE_PIECE_TVDB_BG }
          : {
              id: 21,
              title: { english: "ONE PIECE", romaji: "ONE PIECE" },
              bannerImage: ONE_PIECE_TVDB_BG,
              coverImage: { extraLarge: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-2YLkS1QzAyY7.jpg" },
              description: "Gold Roger was known as the Pirate King, the strongest and most infamous being to have sailed the Grand Line. The capture and execution of Roger by the World Government brought a change throughout the world. His last words before his death revealed the existence of the greatest treasure in the world, One Piece.",
              format: "TV",
              episodes: 1100,
              averageScore: 87,
              genres: ["Action", "Adventure", "Comedy", "Drama", "Fantasy"],
              season: "FALL",
              seasonYear: 1999,
              status: "RELEASING",
            };
        // Remove any existing One Piece from the list, then prepend it
        finalFeatured = [onePieceBanner, ...finalFeatured.filter(a => a.id !== 21)].slice(0, 8);

        setFeatured(finalFeatured);
        if (trend.length > 0) setTrending(trend);
        // Popular anime: uses separate data, no duplicates with Trending
        if (popularData.length > 0) setPopular(popularData); else setPopular(trend);
        setTopRated([...trend].sort((a, b) => getScore(b) - getScore(a)));
      } catch (e) {
        console.error("Home page load error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // If sub-page is browse or genres, show the REAL BrowsePage (full filter UI
  // + AniList results). "genres" is the landing target for legacy "#genre/X"
  // links — BrowsePage has its own genre filter so users can pick the genre
  // they were after.
  if (sectionSubPage === "browse" || sectionSubPage === "genres") {
    return (
      <div className="w-full bg-[#000000] text-white" style={{ paddingTop: "88px", minHeight: "100vh" }}>
        <div className="px-4 lg:px-8 pb-16">
          <BrowsePage />
        </div>
      </div>
    );
  }

  // If sub-page is schedule, show the REAL SchedulePage (live airing schedule from AniList)
  if (sectionSubPage === "schedule") {
    return (
      <div className="w-full bg-[#000000] text-white" style={{ paddingTop: "88px", minHeight: "100vh" }}>
        <div className="px-4 lg:px-8 pb-16">
          <SchedulePage />
        </div>
      </div>
    );
  }

  // If sub-page is dub or sub, show the DubSubPage with language tabs (Tamil, Hindi, etc.)
  if (sectionSubPage === "dub" || sectionSubPage === "sub") {
    return (
      <div className="w-full bg-[#000000] text-white" style={{ paddingTop: "88px", minHeight: "100vh" }}>
        <DubSubPage mode={sectionSubPage as "dub" | "sub"} />
      </div>
    );
  }

  return (
    <div className="w-full bg-[#000000] text-white" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      {/* Hero Carousel — full screen */}
      <HeroCarousel items={featured} navigate={navigate} />

      {/* Join the Squad strip — directly below the hero banner */}
      <JoinTheSquadStrip />

      {/* Continue Watching */}
      <ContinueWatching navigate={navigate} />

      {/* Trending Anime */}
      <TopTrending trending={trending} topRated={topRated} navigate={navigate} />

      {/* Popular Anime */}
      <PopularAnime popular={popular} navigate={navigate} />

      {/* Recently Released — Anikura-style 16:9 cards with episode badges */}
      <RecentlyReleased navigate={navigate} trending={trending} />

      {/* Must Watch Anime — curated editorial row with ambient color glow */}
      <MustWatchAnime topRated={topRated} navigate={navigate} />

      {/* Genre strip — quick-jump pills into Browse */}
      <GenreStrip navigate={navigate} />

      {/* Latest Comments — right below the genre/browse strip */}
      <RecentComments navigate={navigate} trending={trending} />

      {/* Genre Spotlight — wide banner rail, sits directly above Most Watched */}
      <GenreSpotlight navigate={navigate} />

      {/* Most Watched Anime (half) + Airing Schedule (half) — side by side */}
      <section className="px-4 md:px-8 lg:px-8 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <MostWatchedAnime items={popular.length > 0 ? popular : trending} navigate={navigate} />
          <AiringScheduleWidget navigate={navigate} />
        </div>
      </section>

      {/* Coming Soon */}
      <ComingSoon items={trending} navigate={navigate} />

      {/* Footer spacing */}
      <div className="h-4" />
    </div>
  );
}

// Browse and Schedule sub-pages now use the real BrowsePage / SchedulePage components
// imported at the top of this file.
