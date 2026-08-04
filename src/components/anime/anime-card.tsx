"use client";

import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAppStore, getAnimeTitle, getAnimeImage, getTMDBTitle, getTMDBImage, getTMDBYear, getTMDBMediaType, type AnimeItem, type MiruroAnimeItem, type TMDBContentItem } from "./store";

// ── Genre color map for popup tags ──
const GENRE_COLORS: Record<string, string> = {
  Action: "bg-[#ffffff]/20 text-[#ffffff] border-[#ffffff]/30",
  Adventure: "bg-[#FF6B00]/20 text-[#FF6B00] border-[#FF6B00]/30",
  Comedy: "bg-[#FFB800]/20 text-[#FFB800] border-[#FFB800]/30",
  Drama: "bg-[#ffffff]/20 text-[#ffffff] border-[#ffffff]/30",
  Fantasy: "bg-[#4A90E2]/20 text-[#4A90E2] border-[#4A90E2]/30",
  Horror: "bg-[#9333EA]/20 text-[#9333EA] border-[#9333EA]/30",
  Romance: "bg-[#EC4899]/20 text-[#EC4899] border-[#EC4899]/30",
  SciFi: "bg-[#00D4AA]/20 text-[#00D4AA] border-[#00D4AA]/30",
  "Sci-Fi": "bg-[#00D4AA]/20 text-[#00D4AA] border-[#00D4AA]/30",
  Thriller: "bg-[#6366F1]/20 text-[#6366F1] border-[#6366F1]/30",
  Mystery: "bg-[#6366F1]/20 text-[#6366F1] border-[#6366F1]/30",
  SliceOfLife: "bg-[#34D399]/20 text-[#34D399] border-[#34D399]/30",
  "Slice of Life": "bg-[#34D399]/20 text-[#34D399] border-[#34D399]/30",
  Sports: "bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/30",
  Supernatural: "bg-[#FF6B6B]/20 text-[#FF6B6B] border-[#FF6B6B]/30",
  Music: "bg-[#F472B6]/20 text-[#F472B6] border-[#F472B6]/30",
  Mecha: "bg-[#60A5FA]/20 text-[#60A5FA] border-[#60A5FA]/30",
  Psychological: "bg-[#C084FC]/20 text-[#C084FC] border-[#C084FC]/30",
  Ecchi: "bg-[#FB7185]/20 text-[#FB7185] border-[#FB7185]/30",
  Isekai: "bg-[#2DD4BF]/20 text-[#2DD4BF] border-[#2DD4BF]/30",
};
const DEFAULT_GENRE_COLOR = "bg-white/[0.06] text-white/55 border-white/[0.08]";

function getGenreColor(genre: string): string {
  return GENRE_COLORS[genre] || DEFAULT_GENRE_COLOR;
}

// ── Format badge colors ──
function getFormatBadgeStyle(format: string): string {
  const f = format.toUpperCase();
  if (f === "TV" || f === "TV_SHORT") return "bg-[#4A90E2]/90 text-white";
  if (f === "MOVIE") return "bg-[#ffffff]/90 text-white";
  if (f === "ONA") return "bg-[#ffffff]/90 text-white";
  if (f === "OVA") return "bg-[#FF6B00]/90 text-white";
  if (f === "SPECIAL") return "bg-[#F59E0B]/90 text-black";
  if (f === "MUSIC") return "bg-[#EC4899]/90 text-white";
  return "bg-white/20 text-white/80";
}

function getFormatLabel(format: string): string {
  const f = format.toUpperCase();
  if (f === "TV_SHORT") return "SHORT";
  return f;
}

// ── Status indicator colors ──
function getStatusColor(status?: string): string {
  if (!status) return "bg-white/30";
  const s = status.toUpperCase();
  if (s === "RELEASING" || s === "AIRING") return "bg-[#00D4AA]";
  if (s === "FINISHED") return "bg-[#6366F1]";
  if (s === "NOT_YET_RELEASED" || s === "NOT_YET_AIRED") return "bg-[#FF6B00]";
  if (s === "CANCELLED") return "bg-[#ffffff]";
  if (s === "HIATUS") return "bg-[#F59E0B]";
  return "bg-white/30";
}

function getStatusLabel(status?: string): string {
  if (!status) return "";
  const s = status.toUpperCase();
  if (s === "RELEASING") return "Airing";
  if (s === "FINISHED") return "Complete";
  if (s === "NOT_YET_RELEASED") return "TBA";
  if (s === "CANCELLED") return "Cancelled";
  if (s === "HIATUS") return "Hiatus";
  return status;
}

// ── Status badge style for popup ──
function getStatusBadgeStyle(status?: string): string {
  if (!status) return "";
  const s = status.toUpperCase();
  if (s === "RELEASING" || s === "AIRING") return "bg-[#00D4AA]/15 text-[#00D4AA] border-[#00D4AA]/30";
  if (s === "FINISHED") return "bg-[#6366F1]/15 text-[#6366F1] border-[#6366F1]/30";
  if (s === "NOT_YET_RELEASED" || s === "NOT_YET_AIRED") return "bg-[#FF6B00]/15 text-[#FF6B00] border-[#FF6B00]/30";
  if (s === "CANCELLED") return "bg-[#ffffff]/15 text-[#ffffff] border-[#ffffff]/30";
  return "bg-white/[0.06] text-white/55 border-white/[0.08]";
}

interface ContentCardProps {
  anime?: AnimeItem | MiruroAnimeItem;
  tmdbItem?: TMDBContentItem;
  index?: number;
}

export default function ContentCard({ anime, tmdbItem, index = 0 }: ContentCardProps) {
  const navigate = useAppStore(s => s.navigate);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isTMDB = !!tmdbItem;

  const title = isTMDB ? getTMDBTitle(tmdbItem!) : getAnimeTitle(anime!);
  const image = isTMDB ? getTMDBImage(tmdbItem!) : getAnimeImage(anime!);

  // ── Safely extract score ──
  let score: number | undefined;
  if (isTMDB) {
    score = typeof tmdbItem!.vote_average === 'number' ? tmdbItem!.vote_average : undefined;
  } else if (anime) {
    const isMiruroCheck = "title" in anime && !("name" in anime);
    if (isMiruroCheck) {
      const raw = (anime as MiruroAnimeItem).averageScore;
      score = typeof raw === 'number' ? raw : undefined;
    } else {
      const raw = (anime as AnimeItem).score;
      score = typeof raw === 'number' ? raw : undefined;
    }
  }

  const year = isTMDB ? getTMDBYear(tmdbItem!) : undefined;
  const mediaType = isTMDB ? getTMDBMediaType(tmdbItem!) : undefined;

  const isMiruro = !isTMDB && anime && "title" in anime && !("name" in anime);
  const type = isTMDB ? (mediaType === "movie" ? "Movie" : "TV") : isMiruro ? (anime as MiruroAnimeItem).type : anime ? (anime as AnimeItem).type : undefined;
  const format = isMiruro ? (anime as any).format : undefined;
  const status = isMiruro ? (anime as MiruroAnimeItem).status : anime ? (anime as AnimeItem).status : undefined;
  const description = isMiruro ? (anime as MiruroAnimeItem).description : anime ? (anime as AnimeItem).description : undefined;
  const genres = isMiruro ? (anime as MiruroAnimeItem).genres : anime ? (anime as AnimeItem).genres : undefined;
  const seasonYear = isMiruro ? (anime as MiruroAnimeItem).seasonYear : undefined;
  const duration = isMiruro ? (anime as any).duration : undefined;

  // ── Episode count ──
  const episodes = isTMDB ? undefined : isMiruro && anime
    ? (anime as MiruroAnimeItem).episodes
    : anime && (anime as AnimeItem).availableEpisodes
      ? Math.max(
          ...(anime as AnimeItem).availableEpisodes?.sub ? [(anime as AnimeItem).availableEpisodes!.sub || 0] : [],
          ...(anime as AnimeItem).availableEpisodes?.dub ? [(anime as AnimeItem).availableEpisodes!.dub || 0] : [],
          0
        )
      : undefined;

  // ── Sub/Dub availability ──
  const hasSub = !isTMDB && !isMiruro && anime && (anime as AnimeItem).availableEpisodes?.sub && (anime as AnimeItem).availableEpisodes!.sub! > 0;
  const hasDub = !isTMDB && !isMiruro && anime && (anime as AnimeItem).availableEpisodes?.dub && (anime as AnimeItem).availableEpisodes!.dub! > 0;

  // ── Navigation handlers ──
  const handleCardClick = () => {
    if (isTMDB) {
      if (mediaType === "movie") {
        navigate({ page: "movie-detail", id: tmdbItem!.id });
      } else {
        navigate({ page: "tv-detail", id: tmdbItem!.id });
      }
    } else if (anime) {
      const id = isMiruro ? String((anime as MiruroAnimeItem).id) : (anime as AnimeItem)._id;
      navigate({ page: "anime", id });
    }
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTMDB) {
      if (mediaType === "movie") {
        navigate({ page: "movie-watch", id: tmdbItem!.id });
      } else {
        navigate({ page: "tv-watch", id: tmdbItem!.id, season: 1, episode: 1 });
      }
    } else if (anime) {
      const id = isMiruro ? String((anime as MiruroAnimeItem).id) : (anime as AnimeItem)._id;
      navigate({ page: "watch", id, episode: 1 });
    }
  };

  const typeLabel = isTMDB ? (mediaType === "movie" ? "MOVIE" : "TV") : (format || type || "ANIME");
  const scorePercent = score != null && score > 0
    ? (score > 10 ? score : Math.round(score * 10))
    : null;
  const cleanDesc = description ? description.replace(/<[^>]+>/g, "").slice(0, 120) : "";

  // ── Mouse tracking for hover popup ──
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(false);
    setMousePos(null);
  };

  const handlePopupMouseEnter = () => {
    setIsHovered(true);
  };

  const handlePopupMouseLeave = () => {
    setIsHovered(false);
    setMousePos(null);
  };

  // ── Calculate popup position based on mouse cursor ──
  const getPopupStyle = (): React.CSSProperties => {
    if (!mousePos) return { opacity: 0, pointerEvents: "none" as const };

    const popupWidth = 280;
    const popupHeight = 340;
    const offset = 16;

    let left = mousePos.x + offset;
    let top = mousePos.y - popupHeight / 3;

    if (left + popupWidth > window.innerWidth - 10) {
      left = mousePos.x - popupWidth - offset;
    }
    if (left < 10) left = 10;
    if (top + popupHeight > window.innerHeight - 10) {
      top = window.innerHeight - popupHeight - 10;
    }
    if (top < 10) top = 10;

    return {
      position: "fixed" as const,
      top,
      left,
      width: popupWidth,
      zIndex: 9999,
      pointerEvents: "auto" as const,
    };
  };

  // ── Determine format for badge display ──
  const displayFormat = isTMDB
    ? (mediaType === "movie" ? "MOVIE" : "TV")
    : (format || type || "").toString();

  const isReleasing = status && (status.toUpperCase() === "RELEASING" || status.toUpperCase() === "AIRING");

  return (
    <>
      <div
        ref={cardRef}
        className="content-card group text-left w-full relative cursor-pointer"
        style={{ animationDelay: `${index * 50}ms` }}
        onClick={handleCardClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
      >
        {/* ── Card image container — 2:3 aspect ratio poster with 12px rounded corners ── */}
        <div className={`relative aspect-[2/3] overflow-hidden transition-all duration-300 ${
          isHovered ? "-translate-y-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)]" : ""
        }`} style={{ borderRadius: "8px" }}>
          
          {/* Skeleton loader */}
          {!imgLoaded && (
            <div className="absolute inset-0 skeleton" />
          )}

          {/* ── Poster image ── */}
          {image && (
            <img
              src={image}
              alt={title}
              className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ease-out ${
                isHovered ? "scale-105 brightness-[0.55]" : "scale-100 brightness-100"
              } ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setImgLoaded(true)}
              loading="lazy"
            />
          )}

          {/* ══════════════════════════════════════════
              DEFAULT STATE OVERLAYS (fade out on hover)
              ══════════════════════════════════════════ */}

          {/* ── Format badge — top-left ── */}
          {displayFormat && (
            <div className={`absolute top-2 left-2 z-10 transition-all duration-300 ${
              isHovered ? "opacity-0 scale-90" : "opacity-100 scale-100"
            }`}>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase backdrop-blur-sm ${getFormatBadgeStyle(displayFormat)}`}>
                {getFormatLabel(displayFormat)}
              </span>
            </div>
          )}

          {/* ── Status indicator — top-right ── */}
          {status && (
            <div className={`absolute top-2 right-2 z-10 transition-all duration-300 ${
              isHovered ? "opacity-0 scale-90" : "opacity-100 scale-100"
            }`}>
              <div className="flex items-center gap-1">
                {isReleasing && (
                  <span className="text-[8px] font-semibold text-[#00D4AA] uppercase tracking-wider">Airing</span>
                )}
                <div className={`w-2 h-2 rounded-full ${getStatusColor(status)} ${
                  isReleasing ? "animate-pulse shadow-[0_0_6px_rgba(0,212,170,0.5)]" : ""
                }`} />
              </div>
            </div>
          )}

          {/* ── Bottom gradient overlay ── */}
          <div className={`absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black via-black/70 to-transparent transition-opacity duration-300 ${
            isHovered ? "opacity-0" : "opacity-90"
          }`} />

          {/* ── Bottom overlay content: title + score + episode ── */}
          <div className={`absolute inset-x-0 bottom-0 p-3 transition-all duration-300 ${
            isHovered ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
          }`}>
            {/* Score — bottom-left */}
            {scorePercent != null && (
              <div className="flex items-center gap-1 mb-1.5">
                <svg className="w-3 h-3 text-[#FFB800] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-[10px] font-bold text-[#FFB800]">{scorePercent}%</span>
              </div>
            )}

            {/* Title text — bottom */}
            <h3 className="text-[11px] font-semibold text-white line-clamp-2 leading-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
              {title}
            </h3>
          </div>

          {/* ── Episode count badge — bottom-right ── */}
          {(episodes != null && episodes > 0) && (
            <div className={`absolute bottom-2 right-2 z-10 transition-all duration-300 ${
              isHovered ? "opacity-0 scale-90" : "opacity-100 scale-100"
            }`}>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-black/60 backdrop-blur-sm text-[#00D4AA] border border-[#00D4AA]/20">
                EP {episodes}
              </span>
            </div>
          )}

          {/* ══════════════════════════════════════════
              HOVER STATE OVERLAYS (fade in on hover)
              ══════════════════════════════════════════ */}

          {/* ── Glass play button — center ── */}
          <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
            isHovered ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"
          }`}>
            <button
              onClick={handlePlayClick}
              className="w-12 h-12 rounded-full bg-white/[0.10] backdrop-blur-xl hover:bg-white/[0.18] hover:scale-110 flex items-center justify-center border border-white/[0.15] shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-all duration-200 cursor-pointer"
            >
              <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </button>
          </div>

          {/* ── Quick action buttons — bottom ── */}
          <div className={`absolute inset-x-0 bottom-0 p-3 flex items-center gap-2 transition-all duration-300 ${
            isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
          }`}>
            <button
              onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#ffffff] hover:bg-[#D32F3F] text-white text-[9px] font-semibold rounded-full transition-all cursor-pointer shadow-[0_2px_8px_rgba(230,57,70,0.3)]"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Details
            </button>
            <button
              onClick={handlePlayClick}
              className="flex items-center gap-1 px-3 py-1.5 bg-white/[0.10] backdrop-blur-xl hover:bg-white/[0.18] text-white text-[9px] font-medium rounded-full transition-all border border-white/[0.12] cursor-pointer"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Play
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            INFO SECTION — Below the card image
            ══════════════════════════════════════════ */}
        <div className="mt-2.5 px-0.5 space-y-1">
          {/* Title — 1 line truncated */}
          <h3 className="text-[12px] font-semibold text-white line-clamp-1 leading-tight">
            {title}
          </h3>

          {/* Score + Type row */}
          <div className="flex items-center gap-1.5">
            {scorePercent != null && (
              <>
                <svg className="w-3 h-3 text-[#FFB800] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-[10px] font-bold text-[#FFB800]">{scorePercent}%</span>
              </>
            )}
            {(type || format) && (
              <span className="text-[9px] text-white/55 font-medium uppercase tracking-wide ml-auto">
                {format || type}
              </span>
            )}
          </div>

          {/* Sub/DUB badges */}
          {(hasSub || hasDub) && (
            <div className="flex items-center gap-1.5">
              {hasSub && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#4A90E2]/15 text-[#4A90E2] border border-[#4A90E2]/20">
                  SUB
                </span>
              )}
              {hasDub && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#ffffff]/15 text-[#ffffff] border border-[#ffffff]/20">
                  DUB
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          HOVER POPUP — Follows mouse cursor via portal
          ══════════════════════════════════════════════════════════ */}
      {isHovered && typeof document !== "undefined" && createPortal(
        <div
          onMouseEnter={handlePopupMouseEnter}
          onMouseLeave={handlePopupMouseLeave}
          style={{
            ...getPopupStyle(),
            animation: "fadeIn 0.15s ease-out",
          }}
          className="bg-black/98 backdrop-blur-xl rounded-xl border border-white/[0.08] shadow-[0_12px_40px_rgba(0,0,0,0.7)] p-4 space-y-3"
        >
          {/* ── Red accent line at top ── */}
          <div className="h-[2px] rounded-full bg-[#ffffff]" />

          {/* ── Title ── */}
          <h4 className="text-sm font-bold text-white line-clamp-2 leading-snug">
            {title}
          </h4>

          {/* ── Score + Status row ── */}
          <div className="flex items-center gap-2 flex-wrap">
            {scorePercent != null && (
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-[#FFB800]" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-sm font-bold text-[#FFB800]">{scorePercent}%</span>
              </div>
            )}
            {status && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider border ${getStatusBadgeStyle(status)}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(status)} ${isReleasing ? "animate-pulse" : ""}`} />
                {getStatusLabel(status)}
              </span>
            )}
          </div>

          {/* ── Synopsis ── */}
          {cleanDesc && (
            <p className="text-[10px] text-white/55 line-clamp-2 leading-relaxed">
              {cleanDesc}...
            </p>
          )}

          {/* ── Metadata grid ── */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {(format || type) && (
              <div>
                <span className="text-[7px] text-[#666666] uppercase tracking-wider font-bold block mb-0.5">Format</span>
                <p className="text-[10px] text-[#CCCCCC] font-medium">{format || typeLabel}</p>
              </div>
            )}
            {(seasonYear || year) && (
              <div>
                <span className="text-[7px] text-[#666666] uppercase tracking-wider font-bold block mb-0.5">Year</span>
                <p className="text-[10px] text-[#CCCCCC] font-medium">{seasonYear || year || "—"}</p>
              </div>
            )}
            {episodes != null && episodes > 0 && (
              <div>
                <span className="text-[7px] text-[#666666] uppercase tracking-wider font-bold block mb-0.5">Episodes</span>
                <p className="text-[10px] text-[#CCCCCC] font-medium">{episodes} eps</p>
              </div>
            )}
            {duration && (
              <div>
                <span className="text-[7px] text-[#666666] uppercase tracking-wider font-bold block mb-0.5">Duration</span>
                <p className="text-[10px] text-[#CCCCCC] font-medium">{duration} min</p>
              </div>
            )}
          </div>

          {/* ── Genre tags with per-genre colors ── */}
          {genres && genres.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {genres.slice(0, 4).map(g => (
                <span key={g} className={`px-2 py-0.5 rounded-full text-[7px] font-bold border ${getGenreColor(g)}`}>
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* ── Action buttons — Details (red) + Play (glass) ── */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#ffffff] hover:bg-[#D32F3F] text-white text-[10px] font-semibold rounded-full transition-all cursor-pointer shadow-[0_2px_8px_rgba(230,57,70,0.25)]"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Details
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handlePlayClick(e); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.08] hover:bg-white/[0.14] backdrop-blur-sm text-white text-[10px] font-medium rounded-full transition-all border border-white/[0.10] cursor-pointer"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Play
            </button>
          </div>

          {/* ── Bottom subtle divider ── */}
          <div className="h-[1px] rounded-full bg-white/[0.04]" />
        </div>,
        document.body
      )}
    </>
  );
}
