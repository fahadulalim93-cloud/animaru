"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  searchAndFetchThemes,
  pickBestVideo,
  pickCoverImage,
  type AnimeThemesResult,
  type AnimeTheme,
} from "@/lib/anime-music";

// ============================================================
// MusicTab — Anime music (OP/ED themes) panel for the detail page
//
// Layout:
//   • Now-playing bar (sticky, full-width, vinyl-spin animation)
//   • Current anime section (its OP/ED themes)
//   • One section per franchise season (sequels/prequels) so user
//     can browse all "season music" without leaving the detail page
//
// Audio: uses a single <audio> element. Each theme is a .webm video
// file from animethemes.moe — we just play its audio track. Webm is
// supported by every modern browser.
// ============================================================

const ACCENT = "#A78BFA";
const ACCENT_DARK = "#7C3AED";

interface SeasonMusic {
  anilistId?: number;
  title: string;
  slug?: string;
  result?: AnimeThemesResult | null;
  loading: boolean;
  error?: string;
  isCurrent?: boolean;
}

interface MusicTabProps {
  /** AniList ID of the anime currently being viewed */
  anilistId: number | null;
  /** Display title of the current anime */
  currentTitle: string;
  /** Romaji title (often matches animethemes slugs better) */
  romajiTitle?: string;
  /** Franchise seasons — sequels/prequels in the same series */
  seasons: Array<{
    id: number;
    title: { english?: string; romaji?: string; native?: string };
    coverImage?: { extraLarge?: string; large?: string; medium?: string };
    relationType?: string;
    format?: string;
  }>;
}

export default function MusicTab({ anilistId, currentTitle, romajiTitle, seasons }: MusicTabProps) {
  const [seasonMusic, setSeasonMusic] = useState<SeasonMusic[]>([]);
  const [activeTheme, setActiveTheme] = useState<{ theme: AnimeTheme; seasonName: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Build the list of seasons to fetch music for (current + franchise) ──
  // De-dupe by anilistId (the franchise endpoint sometimes returns the
  // current anime as a self-reference).
  useEffect(() => {
    if (!currentTitle) return;

    const seen = new Set<number | string>();
    const list: SeasonMusic[] = [];

    // Current anime first
    list.push({
      anilistId: anilistId || undefined,
      title: currentTitle,
      loading: true,
      isCurrent: true,
    });
    if (anilistId) seen.add(anilistId);

    // Then each franchise season (skip movies/specials to keep it tight — user said "seasons")
    for (const s of seasons) {
      if (s.id && seen.has(s.id)) continue;
      // Only TV/TV_SHORT/ONA formats count as "seasons"
      const fmt = (s.format || "").toUpperCase();
      if (fmt && !["TV", "TV_SHORT", "ONA"].includes(fmt)) continue;
      seen.add(s.id);
      const title = s.title?.english || s.title?.romaji || s.title?.native || "Unknown";
      list.push({
        anilistId: s.id,
        title,
        loading: true,
      });
    }

    setSeasonMusic(list);

    // Fetch themes for each season in parallel using the FAST combined
    // search+fetch function (1 API round-trip per season instead of 2).
    let cancelled = false;
    list.forEach(async (sm, idx) => {
      // Prefer romaji for the current anime (matches animethemes slugs better),
      // english for the rest (often what users search).
      const queryTitle = sm.isCurrent ? (romajiTitle || currentTitle) : sm.title;
      const result = await searchAndFetchThemes(queryTitle);
      if (cancelled) return;
      setSeasonMusic(prev => prev.map((x, i) => i === idx
        ? { ...x, loading: false, slug: result?.slug, result, error: result ? undefined : "No themes found" }
        : x));
    });

    return () => { cancelled = true; };
  }, [anilistId, currentTitle, romajiTitle, seasons]);

  // ── Play a theme ──
  const handlePlay = useCallback((theme: AnimeTheme, seasonName: string) => {
    const video = pickBestVideo(theme);
    if (!video) return;
    setActiveTheme({ theme, seasonName });
    // Defer setting isPlaying until audio loads — the <audio> effect handles it
    setIsPlaying(false);
    // Wait a tick for the audio src to update, then play
    setTimeout(() => {
      const audio = audioRef.current;
      if (audio) {
        audio.src = video.link;
        audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
    }, 0);
  }, []);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  // ── Loading / empty states ──
  const allLoaded = seasonMusic.every(s => !s.loading);
  const hasAnyThemes = seasonMusic.some(s => s.result?.animethemes?.length);

  if (!allLoaded && !hasAnyThemes) {
    return (
      <div className="w-full py-12 flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-white/10 rounded-full animate-spin" style={{ borderTopColor: ACCENT }} />
        <p className="text-xs text-white/50">Loading anime music...</p>
      </div>
    );
  }

  if (!hasAnyThemes) {
    return (
      <div className="w-full py-12 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white/[0.04] border border-white/10 mb-3">
          <svg className="w-6 h-6 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3zm12-3c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3z" />
          </svg>
        </div>
        <p className="text-sm text-white/50">No anime themes found</p>
        <p className="text-xs text-white/30 mt-1">This anime may not be in the animethemes.moe database yet.</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Hidden audio element — we play the .webm video as audio */}
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />

      {/* ═══ NOW PLAYING BAR ═══ */}
      {activeTheme && (
        <div
          className="sticky top-2 z-20 flex items-center gap-3 p-3 rounded-xl border backdrop-blur-md"
          style={{
            background: "linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(167,139,250,0.08) 100%)",
            borderColor: "rgba(167,139,250,0.25)",
          }}
        >
          {/* Spinning vinyl */}
          <div className="relative shrink-0 w-12 h-12">
            <div
              className={`absolute inset-0 rounded-full ${isPlaying ? "animate-spin" : ""}`}
              style={{
                background: "radial-gradient(circle at 50% 50%, #1a1a1a 30%, #000 32%, #2a2a2a 34%, #000 36%, #2a2a2a 38%, #000 40%)",
                animationDuration: "4s",
                border: "2px solid rgba(167,139,250,0.4)",
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full" style={{ background: ACCENT }} />
            </div>
          </div>

          {/* Track info */}
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-[9px] font-extrabold px-1.5 py-0.5 rounded shrink-0"
                style={{ background: ACCENT_DARK, color: "#fff" }}
              >
                {activeTheme.theme.type}
              </span>
              <span className="text-sm font-bold text-white truncate">
                {activeTheme.theme.song.title}
              </span>
            </div>
            <div className="text-[11px] text-white/45 truncate">
              {activeTheme.seasonName}
              {activeTheme.theme.song.artists?.length > 0 && (
                <> · {activeTheme.theme.song.artists.map(a => a.name).join(", ")}</>
              )}
            </div>
          </div>

          {/* Play/pause button */}
          <button
            onClick={togglePlayPause}
            className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
            style={{ background: ACCENT, color: "#000" }}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
            ) : (
              <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            )}
          </button>
        </div>
      )}

      {/* ═══ SEASON SECTIONS ═══ */}
      {seasonMusic.map((sm, idx) => {
        const themes = sm.result?.animethemes || [];
        const ops = themes.filter(t => t.type?.startsWith("OP"));
        const eds = themes.filter(t => t.type?.startsWith("ED"));
        const other = themes.filter(t => !t.type?.startsWith("OP") && !t.type?.startsWith("ED"));
        const coverImg = pickCoverImage(sm.result?.images);

        return (
          <section key={`${sm.anilistId || sm.title}-${idx}`} className="flex flex-col gap-3">
            {/* Section header */}
            <div className="flex items-center gap-3 pb-2 border-b border-white/[0.08]">
              {coverImg && (
                <div className="w-10 h-10 rounded-md overflow-hidden bg-white/5 shrink-0">
                  <img src={coverImg} alt={sm.title} className="w-full h-full object-cover" loading="lazy" />
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <h3 className="text-sm font-bold text-white truncate flex items-center gap-2">
                  {sm.title}
                  {sm.isCurrent && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: ACCENT_DARK, color: "#fff" }}>
                      CURRENT
                    </span>
                  )}
                </h3>
                <span className="text-[10px] text-white/40 uppercase tracking-wider">
                  {sm.result?.year ? `${sm.result.season || ""} ${sm.result.year}`.trim() : "Anime Themes"}
                  {themes.length > 0 && ` · ${themes.length} ${themes.length === 1 ? "track" : "tracks"}`}
                </span>
              </div>
            </div>

            {/* Loading state for this season */}
            {sm.loading && (
              <div className="flex items-center gap-3 py-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse" />
                <span className="text-xs text-white/40">Loading themes...</span>
              </div>
            )}

            {/* Error / no themes */}
            {!sm.loading && themes.length === 0 && (
              <p className="text-xs text-white/30 py-2 italic">{sm.error || "No themes available"}</p>
            )}

            {/* OPs */}
            {ops.length > 0 && (
              <ThemeGroup label="Openings" themes={ops} seasonName={sm.title} onPlay={handlePlay} />
            )}
            {/* EDs */}
            {eds.length > 0 && (
              <ThemeGroup label="Endings" themes={eds} seasonName={sm.title} onPlay={handlePlay} />
            )}
            {/* Other (insert songs, etc.) */}
            {other.length > 0 && (
              <ThemeGroup label="Other" themes={other} seasonName={sm.title} onPlay={handlePlay} />
            )}
          </section>
        );
      })}
    </div>
  );
}

// ── A group of themes (Openings or Endings) — list of playable rows ──
function ThemeGroup({
  label,
  themes,
  seasonName,
  onPlay,
}: {
  label: string;
  themes: AnimeTheme[];
  seasonName: string;
  onPlay: (t: AnimeTheme, seasonName: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] px-1">{label}</h4>
      <div className="flex flex-col gap-1">
        {themes.map(theme => {
          const video = pickBestVideo(theme);
          const artists = theme.song.artists?.map(a => a.name).join(", ") || "";
          return (
            <button
              key={theme.id}
              onClick={() => video && onPlay(theme, seasonName)}
              disabled={!video}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/15 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {/* Type chip */}
              <span
                className="text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0 w-12 text-center"
                style={{
                  background: theme.type.startsWith("OP") ? "rgba(52,211,153,0.15)" : "rgba(251,191,36,0.15)",
                  color: theme.type.startsWith("OP") ? "#34D399" : "#FBBF24",
                }}
              >
                {theme.type}
              </span>

              {/* Track info */}
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-sm font-semibold text-white truncate group-hover:text-violet-200 transition-colors">
                  {theme.song.title}
                </span>
                {artists && (
                  <span className="text-[11px] text-white/45 truncate">{artists}</span>
                )}
              </div>

              {/* Play button — visible on hover, or always for touch */}
              <div
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(167,139,250,0.15)" }}
              >
                <svg className="w-3.5 h-3.5 ml-0.5" fill={ACCENT} viewBox="0 0 24 24">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
