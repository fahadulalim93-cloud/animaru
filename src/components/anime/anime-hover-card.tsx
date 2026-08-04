"use client";

import { useState, useRef, useEffect } from "react";

/**
 * AnimeHoverCard — wraps a poster card and shows a popup tooltip
 * with anime info on hover (desktop) / long-press (mobile).
 *
 * Popup shows: cover image, title, score, year, episodes, genres, short description.
 *
 * Usage:
 *   <AnimeHoverCard anime={anime} navigate={navigate}>
 *     <PosterCard anime={anime} navigate={navigate} />
 *   </AnimeHoverCard>
 */
export default function AnimeHoverCard({
  anime,
  navigate,
  children,
}: {
  anime: any;
  navigate: (r: any) => void;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const [flip, setFlip] = useState<"right" | "left">("right");
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get data
  const title =
    anime?.title?.english || anime?.title?.romaji || anime?.title?.userPreferred || "Untitled";
  const cover =
    anime?.coverImage?.extraLarge || anime?.coverImage?.large || anime?.coverImage?.medium;
  const banner = anime?.bannerImage || cover;
  const score = anime?.averageScore || 0;
  const year = anime?.seasonYear || anime?.startDate?.year;
  const episodes = anime?.episodes;
  const status = anime?.status;
  const format = anime?.format;
  const genres: string[] = (anime?.genres || []).slice(0, 4);
  const description: string = (anime?.description || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

  const handleEnter = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Decide flip direction based on viewport position
      if (wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        // If card is in right 60% of viewport, flip popup to left
        if (rect.left > viewportWidth * 0.55) setFlip("left");
        else setFlip("right");
      }
      setShow(true);
    }, 350); // 350ms hover delay — feels native
  };

  const handleLeave = () => {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
  };

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}

      {/* Hover popup — positioned absolute, only on desktop */}
      {show && (
        <div
          className={`hidden md:block absolute z-50 top-0 ${
            flip === "right" ? "left-full ml-2" : "right-full mr-2"
          } w-[320px] pointer-events-auto`}
          style={{ animation: "fadeInScale 0.15s ease-out" }}
        >
          <div
            className="rounded-lg overflow-hidden border border-white/15 bg-[#0a0a0a] shadow-2xl shadow-black/80"
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
          >
            {/* Banner image */}
            {banner && (
              <div className="relative h-[120px] w-full bg-black/40">
                <img
                  src={banner}
                  alt={title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/30 to-transparent" />
                {/* Score badge */}
                {score > 0 && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur text-[11px] font-bold text-yellow-400 flex items-center gap-0.5">
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    {score}%
                  </div>
                )}
              </div>
            )}

            {/* Body */}
            <div className="p-3 space-y-2">
              {/* Title + cover thumb row */}
              <div className="flex gap-2.5">
                {cover && (
                  <img
                    src={cover}
                    alt={title}
                    className="w-12 h-16 object-cover rounded shrink-0 border border-white/10"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-white leading-tight line-clamp-2">{title}</h3>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-white/50">
                    {year && <span>{year}</span>}
                    {format && <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/60">{format}</span>}
                    {episodes && <span>• {episodes} eps</span>}
                    {status === "RELEASING" && (
                      <span className="px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-medium">Airing</span>
                    )}
                    {status === "FINISHED" && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium">Finished</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Genres */}
              {genres.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {genres.map((g) => (
                    <span
                      key={g}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.06] text-white/70 border border-white/[0.04]"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              {description && (
                <p className="text-[11px] text-white/55 leading-relaxed line-clamp-4">
                  {description}
                </p>
              )}

              {/* View button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLeave();
                  navigate({ page: "anime", id: String(anime.id) });
                }}
                className="w-full mt-1 px-3 py-1.5 rounded-md bg-white text-black text-[11px] font-bold hover:bg-white/90 transition-colors"
              >
                View Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline keyframes (scoped via class) */}
      <style jsx>{`
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(2px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
