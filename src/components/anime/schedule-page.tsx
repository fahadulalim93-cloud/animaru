"use client";

import { useState, useEffect, useMemo } from "react";
import { useAppStore } from "./store";

// ============================================================
// Types
// ============================================================

interface AiringScheduleItem {
  id: number;
  airingAt: number;
  episode: number;
  media: {
    id: number;
    title: { romaji?: string; english?: string; native?: string };
    coverImage: { extraLarge?: string; large?: string; medium?: string };
    bannerImage?: string;
    format?: string;
    episodes?: number;
    averageScore?: number;
    genres?: string[];
    description?: string;
    status?: string;
  };
}

interface DayTab {
  date: Date;
  key: string;
  dayShort: string;
  dayFull: string;
  dateNum: number;
  isToday: boolean;
  items: AiringScheduleItem[];
}

const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ANILIST_API = "https://graphql.anilist.co";

// ── Strip HTML from AniList description ──
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// ── Countdown pill (tiny, sits under episode label on time block) ──
function Countdown({ targetTime, hasAired }: { targetTime: number; hasAired: boolean }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const i = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(i);
  }, []);
  if (hasAired) return <span className="text-[10px] text-white/30 font-mono uppercase tracking-[0.2em]">Aired</span>;
  const diff = targetTime - now;
  if (diff <= 0) return <span className="text-[10px] text-white/30 font-mono uppercase tracking-[0.2em]">Aired</span>;
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  const urgent = diff < 3600;
  return (
    <span className={`text-[10px] font-mono tabular-nums tracking-[0.18em] font-bold ${urgent ? "text-rose-300" : "text-white/45"}`}>
      {d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`}
    </span>
  );
}

// ============================================================
// Anime Card — premium dark card with poster + info + genre pills
//   - Background #111111
//   - 26px border radius
//   - Soft border
//   - Poster 2:3 ratio on the LEFT
//   - Large title, 2-line description, genre pills at bottom
// ============================================================
function AnimeCard({ item, side }: { item: AiringScheduleItem; side: "left" | "right" }) {
  const navigate = useAppStore(s => s.navigate);
  const title = item.media.title?.english || item.media.title?.romaji || item.media.title?.native || "Unknown";
  const image = item.media.coverImage?.extraLarge || item.media.coverImage?.large || item.media.coverImage?.medium || "";
  const now = Math.floor(Date.now() / 1000);
  const hasAired = item.airingAt <= now;
  const description = item.media.description ? stripHtml(item.media.description) : "";
  const genres = (item.media.genres || []).slice(0, 3);
  const score = item.media.averageScore;

  return (
    <button
      onClick={() => navigate({ page: "anime", id: String(item.media.id) })}
      className={`group w-full text-left rounded-[26px] overflow-hidden border transition-all duration-500 ${
        hasAired
          ? "bg-[#0e0e0e] border-white/[0.04] opacity-55 hover:opacity-90"
          : "bg-[#111114] border-white/[0.06] hover:border-white/[0.16] hover:bg-[#16161a]"
      }`}
      style={{
        boxShadow: hasAired
          ? "none"
          : "0 12px 40px -12px rgba(0,0,0,0.7), 0 2px 6px -2px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
        transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.5s ease, border-color 0.3s ease, opacity 0.3s ease",
      }}
    >
      <div className="flex gap-5 p-5">
        {/* Poster — 2:3 ratio */}
        <div className="shrink-0 w-[86px] sm:w-[104px] md:w-[116px] aspect-[2/3] rounded-xl overflow-hidden bg-black border border-white/[0.04]">
          {image ? (
            <img
              src={image}
              alt={title}
              className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 ${hasAired ? "grayscale-[70%]" : ""}`}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/15 font-extrabold text-3xl">
              {title.charAt(0)}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col py-0.5">
          {/* Title row — title + score chip on the same line */}
          <div className="flex items-start gap-2.5">
            <h3 className={`flex-1 min-w-0 text-[16px] sm:text-[18px] md:text-[20px] font-bold leading-tight tracking-tight line-clamp-2 ${
              hasAired ? "text-white/55" : "text-white"
            }`}>
              {title}
            </h3>
            {score ? (
              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-amber-300/90 bg-amber-300/[0.08] border border-amber-300/[0.15] px-1.5 py-0.5 rounded-md tabular-nums">
                ★ {score}
              </span>
            ) : null}
          </div>

          {/* Description — 2 lines */}
          {description && (
            <p className={`text-[12px] sm:text-[12.5px] mt-2 line-clamp-2 leading-relaxed ${hasAired ? "text-white/25" : "text-white/45"}`}>
              {description}
            </p>
          )}

          {/* Genre pills — bottom */}
          <div className="flex flex-wrap gap-1.5 mt-auto pt-3">
            {genres.map(g => (
              <span
                key={g}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  hasAired
                    ? "bg-white/[0.015] border-white/[0.04] text-white/25"
                    : "bg-white/[0.04] border-white/[0.08] text-white/55 group-hover:border-white/20 group-hover:text-white/85"
                }`}
              >
                {g}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

// ============================================================
// Time Block — large typography centered vertically beside timeline
//   - 56px time, white, bold
//   - EPISODE label uppercase, gray, letter-spacing
// ============================================================
function TimeBlock({ item }: { item: AiringScheduleItem }) {
  const airDate = new Date(item.airingAt * 1000);
  const airTime = airDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  const now = Math.floor(Date.now() / 1000);
  const hasAired = item.airingAt <= now;

  return (
    <div className="flex flex-col items-center justify-center text-center py-2">
      {/* Time — 56px on desktop, 38px on mobile */}
      <div
        className={`font-bold tabular-nums leading-none tracking-tight ${
          hasAired ? "text-white/35" : "text-white"
        }`}
        style={{
          fontSize: "clamp(36px, 4.6vw, 54px)",
          textShadow: hasAired ? "none" : "0 2px 20px rgba(255,255,255,0.1)",
        }}
      >
        {airTime}
      </div>

      {/* Divider dot row */}
      <div className="flex items-center gap-1.5 mt-3">
        <span className={`w-1 h-1 rounded-full ${hasAired ? "bg-white/15" : "bg-white/40"}`} />
        <span className={`w-1 h-1 rounded-full ${hasAired ? "bg-white/15" : "bg-white/40"}`} />
        <span className={`w-1 h-1 rounded-full ${hasAired ? "bg-white/15" : "bg-white/40"}`} />
      </div>

      {/* Episode label — uppercase, gray, letter spacing */}
      <div
        className={`mt-3 font-semibold uppercase ${
          hasAired ? "text-white/22" : "text-white/50"
        }`}
        style={{ letterSpacing: "0.32em", fontSize: "10.5px" }}
      >
        Episode {item.episode}
      </div>

      {/* Countdown */}
      <div className="mt-2.5">
        <Countdown targetTime={item.airingAt} hasAired={hasAired} />
      </div>
    </div>
  );
}

// ============================================================
// Main Schedule Page — day selector + VERTICAL ALTERNATING TIMELINE
//   - Center 2px vertical line
//   - Circular node per item (active = brighter, glow)
//   - Card on one side, time on opposite side, alternating
//   - Large vertical spacing between items (120-180px)
// ============================================================
export default function SchedulePage() {
  const [schedule, setSchedule] = useState<AiringScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDayKey, setActiveDayKey] = useState<string>("");

  // Fetch schedule (7 days: 3 before today, today, 3 after)
  useEffect(() => {
    async function fetchSchedule() {
      setLoading(true);
      setError(null);
      try {
        const now = Math.floor(Date.now() / 1000);
        const start = now - (3 * 86400);
        const end = now + (4 * 86400);

        const query = `
          query ($page: Int, $perPage: Int, $airingAt_greater: Int, $airingAt_lesser: Int) {
            Page(page: $page, perPage: $perPage) {
              airingSchedules(airingAt_greater: $airingAt_greater, airingAt_lesser: $airingAt_lesser, sort: TIME) {
                id
                airingAt
                episode
                media {
                  id
                  title { romaji english native }
                  coverImage { extraLarge large medium }
                  bannerImage
                  format episodes
                  averageScore
                  genres
                  description(asHtml: false)
                  status
                }
              }
            }
          }
        `;

        const allItems: AiringScheduleItem[] = [];
        const pages = await Promise.all([
          fetch(ANILIST_API, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ query, variables: { page: 1, perPage: 50, airingAt_greater: start, airingAt_lesser: end } }),
          }).then(r => r.json()),
          fetch(ANILIST_API, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ query, variables: { page: 2, perPage: 50, airingAt_greater: start, airingAt_lesser: end } }),
          }).then(r => r.json()),
        ]);

        for (const page of pages) {
          if (page?.data?.Page?.airingSchedules) {
            allItems.push(...page.data.Page.airingSchedules);
          }
        }

        const seen = new Set<number>();
        const unique = allItems.filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        unique.sort((a, b) => a.airingAt - b.airingAt);
        setSchedule(unique);
      } catch (err: any) {
        console.error("[Schedule] Fetch error:", err);
        setError(err?.message || "Failed to load schedule");
      }
      setLoading(false);
    }
    fetchSchedule();
  }, []);

  // Build 7 day tabs — 3 before today, today, 3 after
  const dayTabs: DayTab[] = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tabs: DayTab[] = [];

    for (let i = -3; i <= 3; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const key = date.toDateString();
      const isToday = date.toDateString() === new Date().toDateString();

      const items = schedule.filter(item => {
        const itemDate = new Date(item.airingAt * 1000);
        return itemDate.toDateString() === key;
      });

      tabs.push({
        date,
        key,
        dayShort: DAYS_SHORT[date.getDay()],
        dayFull: DAYS_FULL[date.getDay()],
        dateNum: date.getDate(),
        isToday,
        items,
      });
    }
    return tabs;
  }, [schedule]);

  // Set active day to Today on load
  useEffect(() => {
    if (dayTabs.length > 0 && !activeDayKey) {
      const today = dayTabs.find(t => t.isToday);
      if (today) setActiveDayKey(today.key);
    }
  }, [dayTabs, activeDayKey]);

  const activeDay = dayTabs.find(t => t.key === activeDayKey) || dayTabs.find(t => t.isToday) || dayTabs[0];
  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="min-h-screen w-full bg-black text-white">
      {/* ═══════════════════════════════════════════════════════════
          HEADER — day selector (centered, square pills, NOT sticky)
          ═══════════════════════════════════════════════════════════ */}
      <div className="bg-black border-b border-white/[0.04]">
        <div className="py-5">
          {/* Day Selector — 7 square pills, centered */}
          <div className="flex items-center justify-center gap-2 sm:gap-2.5 px-4 flex-wrap">
            {dayTabs.map((tab) => {
              const isActive = activeDayKey === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveDayKey(tab.key)}
                  className={`shrink-0 flex flex-col items-center justify-center w-14 h-14 sm:w-[60px] sm:h-[60px] rounded-2xl border transition-all duration-200 ${
                    isActive
                      ? "bg-white border-white text-black scale-105"
                      : "bg-[#0a0a0a] border-white/[0.05] text-white/50 hover:text-white/85 hover:border-white/[0.12] hover:bg-[#141414]"
                  }`}
                  style={{ boxShadow: isActive ? "0 6px 20px -6px rgba(255,255,255,0.25)" : "none" }}
                >
                  <span className={`text-[9.5px] font-bold uppercase tracking-wider leading-none ${isActive ? "text-black/55" : "text-white/40"}`}>
                    {tab.dayShort}
                  </span>
                  <span className={`text-[17px] sm:text-[18px] font-extrabold tabular-nums leading-none mt-1.5 ${isActive ? "text-black" : "text-white"}`}>
                    {tab.dateNum}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Episode count hint under selector */}
          {activeDay && activeDay.items.length > 0 && (
            <div className="mt-3 flex justify-center">
              <span className="text-[10.5px] text-white/35 font-medium">
                <span className="text-white/65 font-bold">{activeDay.items.length}</span> episode{activeDay.items.length !== 1 ? "s" : ""} airing this day
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          TIMELINE BODY — vertical center line, alternating cards/time
          ═══════════════════════════════════════════════════════════ */}
      <div className="px-4 lg:px-8 py-12">
        {/* Section heading — compact, left-aligned with subtle accent line */}
        {activeDay && (
          <div className="mb-14 flex items-end gap-4 max-w-6xl mx-auto">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-px bg-white/30" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-white/40">Weekly Schedule</p>
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-[42px] font-bold tracking-tight text-white leading-none">
                {activeDay.dayFull}
                <span className="text-white/30 ml-3 font-light">
                  {MONTHS[activeDay.date.getMonth()]} {activeDay.date.getDate()}
                </span>
              </h2>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-white/40 pb-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[10px] font-bold text-white/70">
                {activeDay.items.length}
              </span>
              <span>episode{activeDay.items.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        )}

        {loading ? (
          /* Loading state — 5 skeleton timeline rows */
          <div className="relative max-w-6xl mx-auto">
            <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-white/[0.08] -translate-x-1/2 hidden md:block" />
            <div className="space-y-32">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="grid md:grid-cols-[1fr_10%_1fr] items-center gap-0">
                  {i % 2 === 0 ? (
                    <>
                      <div className="flex justify-end pr-8">
                        <div className="w-full max-w-md h-44 rounded-[26px] skeleton border border-white/[0.04]" />
                      </div>
                      <div className="flex justify-center">
                        <div className="w-3.5 h-3.5 rounded-full skeleton" />
                      </div>
                      <div className="flex justify-start pl-8">
                        <div className="w-32 h-16 skeleton rounded" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-end pr-8">
                        <div className="w-32 h-16 skeleton rounded" />
                      </div>
                      <div className="flex justify-center">
                        <div className="w-3.5 h-3.5 rounded-full skeleton" />
                      </div>
                      <div className="flex justify-start pl-8">
                        <div className="w-full max-w-md h-44 rounded-[26px] skeleton border border-white/[0.04]" />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-24">
            <p className="text-white/50 text-sm mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 text-xs font-bold bg-white/[0.06] text-white rounded-lg hover:bg-white/[0.1] border border-white/[0.08] transition-all"
            >
              Try Again
            </button>
          </div>
        ) : !activeDay || activeDay.items.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-14 h-14 mx-auto rounded-full bg-white/[0.03] flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <p className="text-white/40 text-sm">No episodes scheduled for this day</p>
            <p className="text-white/25 text-xs mt-1">Try selecting another day above</p>
          </div>
        ) : (
          /* ═══════════════════════════════════════════════════════════
              THE TIMELINE
              - Vertical 2px line centered on desktop
              - On mobile, line shifts to left edge, cards always on right
              - Alternating: even index = card left/time right
              - 120-180px spacing between items
              ═══════════════════════════════════════════════════════════ */
          <div className="relative max-w-6xl mx-auto">
            {/* Center vertical line — desktop */}
            <div
              className="hidden md:block absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 pointer-events-none"
              style={{
                background: "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.18) 8%, rgba(255,255,255,0.18) 92%, transparent 100%)",
              }}
              aria-hidden={true}
            />
            {/* Left vertical line — mobile */}
            <div
              className="md:hidden absolute left-4 top-0 bottom-0 w-[2px] pointer-events-none"
              style={{
                background: "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.18) 8%, rgba(255,255,255,0.18) 92%, transparent 100%)",
              }}
              aria-hidden={true}
            />

            <div className="space-y-20 md:space-y-36">
              {activeDay.items.map((item, i) => {
                const isCardOnLeft = i % 2 === 0;
                const hasAired = item.airingAt <= now;
                const isNext = !hasAired && activeDay.items.slice(0, i).every(prev => prev.airingAt <= now);

                /* ── Desktop: 3-col grid (45% / 10% / 45%) ── */
                return (
                  <div
                    key={`${item.id}-${item.episode}`}
                    className="relative"
                    style={{ minHeight: "180px" }}
                  >
                    {/* DESKTOP — alternating layout */}
                    <div className="hidden md:grid md:grid-cols-[45%_10%_45%] items-center">
                      {isCardOnLeft ? (
                        <>
                          {/* Card on left */}
                          <div className="flex justify-end pr-10">
                            <div className="w-full max-w-md">
                              <AnimeCard item={item} side="left" />
                            </div>
                          </div>

                          {/* Center node */}
                          <div className="flex justify-center relative z-10">
                            <TimelineNode hasAired={hasAired} isNext={isNext} />
                          </div>

                          {/* Time on right */}
                          <div className="flex justify-start pl-10">
                            <div className="w-full max-w-xs">
                              <TimeBlock item={item} />
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Time on left */}
                          <div className="flex justify-end pr-10">
                            <div className="w-full max-w-xs">
                              <TimeBlock item={item} />
                            </div>
                          </div>

                          {/* Center node */}
                          <div className="flex justify-center relative z-10">
                            <TimelineNode hasAired={hasAired} isNext={isNext} />
                          </div>

                          {/* Card on right */}
                          <div className="flex justify-start pl-10">
                            <div className="w-full max-w-md">
                              <AnimeCard item={item} side="right" />
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* MOBILE — single column with line on left */}
                    <div className="md:hidden flex items-center pl-12 relative">
                      {/* Mobile node */}
                      <div className="absolute left-4 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                        <TimelineNode hasAired={hasAired} isNext={isNext} mobile />
                      </div>
                      <div className="w-full">
                        {/* Mobile: time on top, card below */}
                        <div className="mb-3">
                          <TimeBlock item={item} />
                        </div>
                        <AnimeCard item={item} side="right" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        {!loading && !error && schedule.length > 0 && (
          <div className="mt-24 pt-6 border-t border-white/[0.04] flex items-center justify-between flex-wrap gap-3 max-w-6xl mx-auto">
            <p className="text-[11px] text-white/30">
              {schedule.length} episodes · Times in your local timezone
            </p>
            <div className="flex items-center gap-5 text-[10px] text-white/35">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-white" style={{ boxShadow: "0 0 6px rgba(255,255,255,0.5)" }} />
                <span>Upcoming</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-300" style={{ boxShadow: "0 0 6px rgba(253,164,175,0.6)" }} />
                <span>Airing Soon</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-white/20" />
                <span>Aired</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .skeleton {
          background: linear-gradient(90deg, rgba(255,255,255,0.025) 25%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.025) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.8s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// Timeline Node — circular dot on the center line
//   - Soft glow
//   - Active (next-up) = brighter with rose tint
//   - Aired = dimmed
// ============================================================
function TimelineNode({ hasAired, isNext, mobile = false }: { hasAired: boolean; isNext: boolean; mobile?: boolean }) {
  const size = mobile ? 11 : 12;
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer glow — soft halo */}
      <div
        className="absolute rounded-full"
        style={{
          width: size * 3.2,
          height: size * 3.2,
          background: hasAired
            ? "radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)"
            : isNext
            ? "radial-gradient(circle, rgba(253,164,175,0.32) 0%, transparent 70%)"
            : "radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)",
        }}
      />
      {/* Outer ring — thin border ring */}
      <div
        className="absolute rounded-full border"
        style={{
          width: size + 8,
          height: size + 8,
          borderColor: hasAired ? "rgba(255,255,255,0.08)" : isNext ? "rgba(253,164,175,0.35)" : "rgba(255,255,255,0.22)",
        }}
      />
      {/* Inner dot */}
      <div
        className="relative rounded-full transition-all duration-300"
        style={{
          width: size,
          height: size,
          background: hasAired
            ? "rgba(255,255,255,0.18)"
            : isNext
            ? "linear-gradient(135deg, #fda4af 0%, #fb7185 100%)"
            : "linear-gradient(135deg, #ffffff 0%, #d4d4d4 100%)",
          boxShadow: hasAired
            ? "none"
            : isNext
            ? "0 0 10px rgba(253,164,175,0.65), 0 0 20px rgba(253,164,175,0.25)"
            : "0 0 8px rgba(255,255,255,0.5), 0 0 16px rgba(255,255,255,0.15)",
        }}
      />
    </div>
  );
}
