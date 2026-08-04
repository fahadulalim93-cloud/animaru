"use client";

import { useState, useEffect } from "react";
import AnimeHoverCard from "./anime-hover-card";

/**
 * WatchPageExtras — sits below the Community Discussion comment section
 * on the anime watch page.
 *
 * Layout (per user spec):
 *   Single row, side by side:  [ Today's Schedule (half) ]  [ Top 10 Anime (half) ]
 *
 * All cards support hover popups (AnimeHoverCard).
 */

// ── helpers ──
function getTitle(a: any): string {
  return a?.title?.english || a?.title?.romaji || a?.title?.userPreferred || a?.title?.native || "Untitled";
}
function getCover(a: any): string | undefined {
  return a?.coverImage?.extraLarge || a?.coverImage?.large || a?.coverImage?.medium;
}
function getScore(a: any): number {
  return a?.averageScore || 0;
}

// ── Today's Schedule ──
function TodaysSchedule({ navigate }: { navigate: (r: any) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/anime/anilist-schedule");
        if (!res.ok) throw new Error("schedule fetch failed");
        const data = await res.json();
        if (cancelled) return;

        // Pick today's key (first entry in days array)
        const todayKey = data.days?.[0];
        if (!todayKey) {
          setLoading(false);
          return;
        }
        const todayItems: any[] = data.schedule?.[todayKey] || [];

        // Sort by airingAt, dedupe by media.id
        const seen = new Set<number>();
        const dedup = todayItems
          .sort((a, b) => a.airingAt - b.airingAt)
          .filter((s) => {
            const id = s.media?.id;
            if (id == null || seen.has(id)) return false;
            seen.add(id);
            return true;
          })
          .slice(0, 8);

        setItems(dedup);
      } catch (e) {
        console.error("[TodaysSchedule] error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Today&apos;s Schedule</h3>
        </div>
        <span className="text-[10px] text-white/30">
          {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </span>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto ltv-scroll max-h-[360px]">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg animate-pulse">
              <div className="w-10 h-10 rounded bg-white/5" />
              <div className="flex-1">
                <div className="h-3 w-3/4 bg-white/5 rounded mb-1" />
                <div className="h-2 w-1/3 bg-white/5 rounded" />
              </div>
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-xs text-white/30">No episodes airing today</div>
        ) : (
          items.map((s) => {
            const media = s.media;
            if (!media) return null;
            const title = getTitle(media);
            const cover = getCover(media);
            const ep = s.episode;
            const time = new Date(s.airingAt * 1000).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            });
            return (
              <AnimeHoverCard key={`${media.id}-${ep}`} anime={media} navigate={navigate}>
                <button
                  onClick={() => navigate({ page: "anime", id: String(media.id) })}
                  className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors text-left group"
                >
                  {/* Time pill */}
                  <div className="shrink-0 w-12 text-center">
                    <p className="text-[10px] font-bold text-white/70">{time.split(" ")[0]}</p>
                    <p className="text-[9px] text-white/30 uppercase">{time.split(" ")[1]}</p>
                  </div>
                  {/* Cover */}
                  <div className="shrink-0 w-9 h-12 rounded overflow-hidden bg-white/5 border border-white/[0.06]">
                    {cover ? (
                      <img src={cover} alt={title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white/20">
                        {title.charAt(0)}
                      </div>
                    )}
                  </div>
                  {/* Title + ep */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate group-hover:text-white/80 transition-colors">
                      {title}
                    </p>
                    <p className="text-[10px] text-white/40">Episode {ep}</p>
                  </div>
                </button>
              </AnimeHoverCard>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Top 10 Anime (small card list) ──
function Top10Anime({ navigate }: { navigate: (r: any) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/anime/anilist-trending?section=topRated");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const list = data.topRated || [];
        // Sort by score desc, take top 10
        const sorted = [...list]
          .sort((a, b) => getScore(b) - getScore(a))
          .slice(0, 10);
        setItems(sorted);
      } catch (e) {
        console.error("[Top10Anime] error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Top 10 Anime</h3>
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto ltv-scroll max-h-[360px]">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 p-2 animate-pulse">
              <div className="w-5 h-5 bg-white/5 rounded" />
              <div className="w-10 h-12 bg-white/5 rounded" />
              <div className="flex-1">
                <div className="h-3 w-3/4 bg-white/5 rounded mb-1" />
                <div className="h-2 w-1/3 bg-white/5 rounded" />
              </div>
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-xs text-white/30">No data</div>
        ) : (
          items.map((a, idx) => {
            const title = getTitle(a);
            const cover = getCover(a);
            const score = getScore(a);
            const rank = idx + 1;
            return (
              <AnimeHoverCard key={a.id} anime={a} navigate={navigate}>
                <button
                  onClick={() => navigate({ page: "anime", id: String(a.id) })}
                  className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors text-left group"
                >
                  {/* Rank number */}
                  <div className="shrink-0 w-5 text-center">
                    <span className="text-sm italic font-extrabold text-white/70 group-hover:text-white transition-colors">
                      {rank}
                    </span>
                  </div>
                  {/* Cover */}
                  <div className="shrink-0 w-9 h-12 rounded overflow-hidden bg-white/5 border border-white/[0.06]">
                    {cover ? (
                      <img src={cover} alt={title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white/20">
                        {title.charAt(0)}
                      </div>
                    )}
                  </div>
                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate group-hover:text-white/80 transition-colors">
                      {title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {score > 0 && (
                        <span className="text-[10px] font-bold text-yellow-400 flex items-center gap-0.5">
                          <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          {score}%
                        </span>
                      )}
                      {a.seasonYear && <span className="text-[10px] text-white/30">{a.seasonYear}</span>}
                    </div>
                  </div>
                </button>
              </AnimeHoverCard>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Main export ──
// Under Community Discussion on watch page:
//   Single row, side by side — Schedule (half) | Top 10 Anime (half)
//   (Popular Next Season full-width section removed per user request)
export default function WatchPageExtras({ navigate }: { navigate: (r: any) => void }) {
  return (
    <div className="mt-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TodaysSchedule navigate={navigate} />
        <Top10Anime navigate={navigate} />
      </div>
    </div>
  );
}
