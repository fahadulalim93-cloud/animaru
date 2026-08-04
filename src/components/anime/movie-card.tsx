"use client";

import { useAppStore, getTMDBTitle, getTMDBImage, getTMDBYear, getTMDBMediaType, type TMDBContentItem } from "./store";

const GROTESK = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

/**
 * Cinematic poster card for the Movies/TV section — solid dark surface,
 * blue accent on hover, play chip overlay. Used in rails (shrink-0 wrapper)
 * and grids alike.
 */
export default function MovieCard({ item, priority = false }: { item: TMDBContentItem; priority?: boolean }) {
  const navigate = useAppStore(s => s.navigate);
  const title = getTMDBTitle(item);
  const image = getTMDBImage(item);
  const year = getTMDBYear(item);
  const type = getTMDBMediaType(item);
  const score = item.vote_average ? (item.vote_average > 10 ? item.vote_average / 10 : item.vote_average) : 0;

  const open = () => navigate(type === "tv" ? { page: "tv-detail", id: item.id } : { page: "movie-detail", id: item.id });

  return (
    <button onClick={open} className="group block w-full text-left" title={title}>
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[#0a0d13] border border-white/[0.06] transition-colors duration-300 group-hover:border-[#1e88ff]/60">
        {image ? (
          <img
            src={image}
            alt={title}
            loading={priority ? "eager" : "lazy"}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#5b616c]">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
              <rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M7 5v14M17 5v14" />
            </svg>
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100">
          <span className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg" style={{ background: type === "tv" ? "#34D399" : "#1e88ff", boxShadow: type === "tv" ? "0 8px 24px rgba(52,211,153,0.4)" : "0 8px 24px rgba(30,136,255,0.4)" }}>
            <svg className="w-4.5 h-4.5 text-white translate-x-[1px]" width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          </span>
        </div>
        {/* Type badge — ticket tab for movies, channel LED for TV */}
        {type === "tv" ? (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-extrabold tracking-wider uppercase bg-black/70 border border-[#34D399]/30 text-[#34D399]" style={{ fontFamily: GROTESK }}>
            <i className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" />
            TV
          </span>
        ) : (
          <span className="absolute top-2 left-2 flex items-center" style={{ fontFamily: GROTESK }}>
            <span className="px-1.5 py-0.5 rounded-l-md text-[9px] font-extrabold tracking-wider uppercase bg-[#48a6ff] text-[#05070b] border-r border-dashed border-black/30">
              🎬
            </span>
            <span className="px-1.5 py-0.5 rounded-r-md text-[9px] font-extrabold tracking-wider uppercase bg-black/70 text-[#c4c9d2] border border-white/10 border-l-0">
              Movie
            </span>
          </span>
        )}
      </div>
      <div className="pt-2 px-0.5">
        <p className="text-[13px] font-semibold text-[#e8eaee] truncate transition-colors group-hover:text-[#48a6ff]" style={{ fontFamily: GROTESK }}>{title}</p>
        <p className="text-[11px] text-[#767d8a] mt-0.5 flex items-center gap-1.5">
          {year && <span>{year}</span>}
          {year && score > 0 && <span className="w-0.5 h-0.5 rounded-full bg-[#5b616c]" />}
          {score > 0 && (
            <span className="inline-flex items-center gap-1 text-[#48a6ff] font-bold">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
              {score.toFixed(1)}
            </span>
          )}
        </p>
      </div>
    </button>
  );
}
