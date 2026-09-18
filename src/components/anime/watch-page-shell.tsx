"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "./store";

// ============================================================
// WatchPageShell — Miruro-inspired watch layout
//
// Layout:
//   Left  (~70%): Player → Toggles bar → Episode title + meta +
//                 audio/server dropdowns → Episode synopsis →
//                 Anime info card → Comments
//   Right (~30%): Episode sidebar (spoiler blur, 1-100 pages,
//                 filter, next-ep countdown footer) → RELATED →
//                 RECOMMENDATIONS
//
// Accent: purple (#A78BFA / #7C3AED) — matches episode active state
// ============================================================

const ACCENT = "#A78BFA";
const ACCENT_SOLID = "#7C3AED";

// ─── Tiny dropdown (click to open, backdrop to close) ───────────
// Fixed for mobile: uses ref to measure trigger position, positions
// dropdown below trigger on mobile via inline style.
// On desktop, sm:top-full handles positioning (inline top NOT applied).
function MenuSelect({ label, value, options, onChange, disabledIds = [] }: {
  label?: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (id: string) => void;
  disabledIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [mobileTop, setMobileTop] = useState<number | null>(null);
  const current = options.find(o => o.id === value);

  const handleToggle = useCallback(() => {
    if (!open && triggerRef.current) {
      // Only measure for mobile — desktop uses sm:top-full (CSS relative positioning)
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
      if (isMobile) {
        const rect = triggerRef.current.getBoundingClientRect();
        setMobileTop(rect.bottom + 4);
      }
    }
    setOpen(prev => !prev);
  }, [open]);

  const handleSelect = useCallback((id: string) => {
    onChange(id);
    setOpen(false);
  }, [onChange]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={handleToggle}
        style={{ touchAction: 'manipulation' }}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] active:bg-white/[0.15] border border-white/[0.08] text-xs font-bold text-white/85 transition-all w-full sm:w-auto select-none"
      >
        {label && <span className="text-[9px] font-bold text-white/35 uppercase tracking-wider">{label}</span>}
        <span className="max-w-[110px] truncate flex-1 sm:flex-none text-left">{current?.label || value || "—"}</span>
        <svg className={`w-3 h-3 text-white/40 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z" /></svg>
      </button>
      {open && (
        <>
          {/* Backdrop — fixed to cover entire viewport, below dropdown */}
          <div
            className="fixed inset-0"
            style={{ zIndex: 9998 }}
            onClick={handleClose}
            onTouchEnd={(e) => { e.preventDefault(); handleClose(); }}
          />
          {/* Dropdown — fixed on mobile (positioned below trigger via mobileTop),
              absolute on desktop (below trigger via sm:top-full).
              CRITICAL: Only set inline 'top' on mobile — on desktop, sm:top-full
              must be allowed to work (inline style overrides CSS classes). */}
          <div
            className="fixed left-3 right-3 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1 bg-[#0a0a0a] border border-white/15 rounded-lg overflow-hidden py-1 shadow-2xl max-h-[50vh] sm:max-h-[280px] overflow-y-auto min-w-[140px] w-auto sm:w-max"
            style={{ zIndex: 9999, ...(mobileTop != null ? { top: mobileTop } : {}) }}
          >
            {options.map(o => {
              const disabled = disabledIds.includes(o.id);
              return (
                <button
                  key={o.id}
                  disabled={disabled}
                  onClick={() => { if (!disabled) handleSelect(o.id); }}
                  style={{ touchAction: 'manipulation' }}
                  className={`block w-full text-left px-3 py-3 sm:py-2 text-xs transition-colors whitespace-nowrap select-none ${o.id === value ? "font-bold" : "text-white/60 active:bg-white/10 hover:bg-white/10 hover:text-white"} ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Checkbox toggle (purple squares like Miruro) ────────────────
function ToggleCheck({ label, state, onToggle }: { label: string; state: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="flex items-center gap-1.5 group shrink-0">
      <div
        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${state ? "" : "bg-transparent border-white/20 group-hover:border-white/40"}`}
        style={state ? { background: ACCENT, borderColor: ACCENT } : undefined}
      >
        {state && <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </div>
      <span className={`text-xs font-medium transition-colors ${state ? "" : "text-white/40 group-hover:text-white/70"}`} style={state ? { color: ACCENT } : undefined}>{label}</span>
    </button>
  );
}

// ─── Sidebar media card (RELATED / RECOMMENDATIONS lists) ────────
function SideMediaCard({ item, subtitle, navigate }: { item: any; subtitle?: string; navigate: (r: any) => void }) {
  const title = item.title?.english || item.title?.romaji || item.title?.native || "Unknown";
  const img = item.coverImage?.extraLarge || item.coverImage?.large || item.coverImage?.medium || "";
  const format = (item.format || item.type || "").replace(/_/g, " ");
  return (
    <button
      onClick={() => navigate({ page: "anime", id: String(item.id) })}
      className="relative flex w-full items-stretch gap-3 rounded-xl overflow-hidden border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-all text-left group"
    >
      {/* Backdrop art (faint, right side) */}
      {img && (
        <div
          className="absolute inset-0 opacity-[0.1] group-hover:opacity-[0.16] transition-opacity pointer-events-none"
          style={{ backgroundImage: `url(${img})`, backgroundSize: "cover", backgroundPosition: "center 20%" }}
        />
      )}
      <div className="relative shrink-0 w-[64px] self-stretch min-h-[92px] overflow-hidden bg-white/5">
        {img
          ? <img src={img} alt={title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          : <div className="absolute inset-0 flex items-center justify-center text-white/15 font-bold text-lg">{title.charAt(0)}</div>}
      </div>
      <div className="relative flex flex-col justify-center gap-1.5 py-2.5 pr-3 min-w-0">
        <div className="flex items-start gap-1.5">
          <span className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#60A5FA" }} />
          <p className="text-[13px] font-semibold text-white leading-snug line-clamp-2">{title}</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-white/45 pl-3">
          {format && <span className="uppercase">{format}</span>}
          {item.episodes ? (
            <span className="flex items-center gap-0.5 bg-white/[0.07] rounded px-1 py-0.5">
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 9H6v-2h5v2zm7-4H6V7h12v2z"/></svg>
              {item.episodes}
            </span>
          ) : null}
          {item.averageScore ? (
            <span className="flex items-center gap-0.5">
              <svg className="w-2.5 h-2.5 text-white/45" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
              {item.averageScore}
            </span>
          ) : null}
          {subtitle && <span className="uppercase text-white/30">{subtitle}</span>}
        </div>
      </div>
    </button>
  );
}

export function WatchPageShell({
  streamLoading, streamError, streamData, activeProvider,
  animeTitle, animeTitleRomaji, episodeNum, animeEpisodes, animeDuration, animeStatus,
  animeImage, animeDescription, animeScore, animeType, animeSeason,
  animeStudios, animeGenres, animeNextAiring, countdown,
  translation, softsubAvailable, hardsubAvailable, dubAvailable,
  handleTranslationChange,
  serverList, selectedServer, setSelectedServer, setStreamError,
  setStreamLoading, getProviderDisplayName,
  episodeList, filteredEps, epSearch, setEpSearch, switchEpisode,
  prevEp, nextEp,
  autoPlay, setAutoPlay, autoSkip, setAutoSkip, autoNext, setAutoNext,
  skipFiller, setSkipFiller,
  fullscreenRetain, setFullscreenRetain,
  navigate, relations, recommendations, subCount, dubCount,
  HLSPlayerNew, EmbedPlayerWithFallback, DashPlayer, proxifyM3u8, proxify,
  AnimeComments,
  handleVideoEnded, handleProviderFailed, handleProviderSelect,
  failedProviders, providersForCurrentEp,
  setScraperFallbackToken, showShortcuts, setShowShortcuts,
  lightsOff, setLightsOff,
  theaterMode, setTheaterMode,
  synopsisExpanded, setSynopsisExpanded, animeId,
  playerReady, onCanPlay, animeBackdrop,
}: any) {
  const [visibleEpCount, setVisibleEpCount] = useState(50);
  const [epSynopsisExpanded, setEpSynopsisExpanded] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const user = useAppStore((s) => s.user);

  const currentEp = episodeList?.find((ep: any) => ep.number === episodeNum);
  const epTitle = currentEp?.title && !/^Episode \d+$/i.test(currentEp.title)
    ? currentEp.title
    : `Episode ${episodeNum}`;

  // ── Allowed sources for Sub/Dub/HardSub tabs ──
  // On Vercel ALL sources (except Hindi) were shown in sub/dub/hardsub.
  // Replicate that: only Hindi sources are excluded from sub/dub/hardsub.
  const HINDI_ONLY_SOURCES = new Set(["animesalt"]);
  // Indian languages — AnimeSalt servers with these providers go in Hindi tab.
  // English/Japanese AnimeSalt servers go to Dub/Sub tabs.
  const INDIAN_LANGS = new Set([
    "hindi", "tamil", "telugu", "malayalam", "bengali", "marathi", "kannada",
  ]);
  const SOURCE_PRIORITY: Record<string, number> = {
    reanime: 0,   // flixcloud.cc embed — fastest (no proxy, browser loads directly)
    anineko: 0, "anineko-to": 0,
    anidao: 1,
    animex: 2,
    anidap: 3,
    anikoto: 5, anichi: 5,
    anidb: 7,
    anipm: 8,
    miruro: 9,
    animepahe: 10,
    anikuro: 11,
    mioanime: 12,
    anistream: 13,
    animeonsen: 14,
    anivexa: 15,
    anivault: 16,
    senshi: 17,
    animo4: 18,
    anibd: 19,
    byse: 20,       // self-hosted Hindi/multi-audio (bysejikuar.com embed)
    uniquestream: 21,
  }; // removed: animeheaven (Shanks — unreliable), luna

  // Servers available for the current audio mode
  // Vercel behavior: ALL sources shown in sub/dub/hardsub except Hindi-only ones.
  // Hindi tab: AnimeSalt + Byse Hindi servers
  // AniKoto/AniChi: sub servers REMOVED (unreliable) — only dub shown
  const serversForMode = (serverList || []).filter((s: any) => {
    // Do NOT filter out AniKoto/AniChi sub servers anymore — the new
    // anikoto-direct.ts (port of anikoto.py) returns reliable sub streams
    // via Megaplay + VidWish. The old dub-only filter was a workaround for
    // the previous broken implementation. Now sub streams work fine.
    if (translation === "hindi") {
      // Hindi tab: only Indian-language AnimeSalt servers (Hindi/Tamil/Telugu/
      // Malayalam/Bengali/Marathi/Kannada). English + Japanese AnimeSalt
      // servers go to the Dub / Sub tabs respectively.
      if (s.source === "animesalt") {
        return INDIAN_LANGS.has((s.provider || "").toLowerCase());
      }
      return s.source === "byse" && s.type === "hindi";
    }
    // Sub/Dub/HardSub tabs: exclude Indian-language AnimeSalt (those are in
    // Hindi tab) but INCLUDE non-Indian AnimeSalt servers (English→Dub,
    // Japanese→Sub).
    if (s.source === "animesalt" && INDIAN_LANGS.has((s.provider || "").toLowerCase())) {
      return false;
    }
    if (translation === "dub") {
      return s.type === "dub";
    }
    if (translation === "hardsub") {
      return s.type === "sub" && s.hardsub === true;
    }
    // Sub tab: all non-Hindi sub servers — INCLUDING hardsub servers.
    // Hardsub servers have subtitles burned into video but are still sub-type
    // and should be available in the Sub tab too.
    return s.type === "sub";
  }).sort((a: any, b: any) => {
    // Sort by user-specified priority order
    const pa = SOURCE_PRIORITY[a.source] ?? 99;
    const pb = SOURCE_PRIORITY[b.source] ?? 99;
    if (pa !== pb) return pa - pb;
    // Within same source, sub before dub, non-embed before embed
    if (a.type !== b.type) return a.type === "sub" ? -1 : 1;
    if (!!a.isEmbed !== !!b.isEmbed) return a.isEmbed ? 1 : -1;
    return 0;
  });

  const audioOptions = [
    { id: "sub", label: "Sub" },
    { id: "hardsub", label: "Hard Sub" },
    { id: "dub", label: "Dub" },
    { id: "hindi", label: "Hindi" },
  ];
  const audioDisabled = [
    ...(!softsubAvailable ? ["sub"] : []),
    ...(!hardsubAvailable ? ["hardsub"] : []),
    ...(!dubAvailable ? ["dub"] : []),
  ];

  // Alt servers for the 404 quick-switch row (up to 3 that aren't selected)
  const altServers = serversForMode.filter((s: any) => s.id !== selectedServer).slice(0, 3);

  const handleReport = () => {
    setShowReportModal(true);
    setReportSubmitted(false);
    setReportDescription("");
  };

  const submitReport = () => {
    const server = selectedServer || activeProvider;
    const userDesc = reportDescription.trim();
    const fullMessage = userDesc
      ? `${userDesc} — ${animeTitle} EP ${episodeNum} [${server}]`
      : `Playback issue on ${animeTitle} — Episode ${episodeNum}${streamError ? `: ${streamError}` : ""}`;
    fetch("/api/reports/watch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        username: user?.username,
        message: fullMessage,
        animeTitle, episodeNum, server, mode: translation, error: streamError || undefined,
        url: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    }).catch(() => {});
    setReportSubmitted(true);
    setReportCopied(true);
    setTimeout(() => { setReportCopied(false); }, 1800);
  };

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: `${animeTitle} — Episode ${episodeNum}`, url }).catch(() => {});
    } else {
      try { navigator.clipboard.writeText(url); } catch { /* ignore */ }
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    }
  };

  // ── Watch Together: dispatches global event, modal is in separate component ──
  const handleWatchTogether = () => {
    window.dispatchEvent(new Event("w2g:open"));
  };

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: "var(--font-inter), Inter, sans-serif" }}>

      {/* DNS prefetch + preconnect for faster stream loading.
          Same-domain /p/{token} proxy doesn't need preconnect (browser already
          has HTTP/2 connection from page load), but the upstream CDNs still
          benefit from preconnect for the player's direct requests. */}
      <link rel="dns-prefetch" href="https://vivibebe.site" />
      <link rel="preconnect" href="https://vivibebe.site" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://cdn.kryntal.top" />
      <link rel="preconnect" href="https://cdn.kryntal.top" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://cdn.anizara.store" />
      <link rel="preconnect" href="https://cdn.anizara.store" crossOrigin="anonymous" />

      {/* Lights Off — hides sidebar + topbar (search bar) via CSS opacity:0 */}
      {lightsOff && (
        <style dangerouslySetInnerHTML={{ __html: `
          aside[class*="fixed left-0"][class*="z-[70]"] {
            opacity: 0 !important;
            pointer-events: none !important;
          }
          header[class*="fixed top-0"][class*="z-[65]"] {
            opacity: 0 !important;
            pointer-events: none !important;
          }
          nav[class*="fixed bottom-0"][class*="z-[75]"] {
            opacity: 0 !important;
            pointer-events: none !important;
          }
        `}} />
      )}

      {/* ══ LAYOUT ══ */}
      {/* Normal mode: two-column (player 74% | sidebar 26%) side by side.
          Theater mode: player is centered + wider (full width), all other
          content (toggles, episode title, sidebar, comments) drops BELOW
          the player. Nothing is hidden — just reflowed into a single column. */}
      <div className={`flex w-full gap-4 items-start px-2 lg:px-3 pt-2 pb-12 ${theaterMode ? "flex-col" : "max-lg:flex-col"}`}>

        {/* ══ LEFT COLUMN — Player + everything under it ══ */}
        {/* Normal mode: 74% width. Theater mode: 86% width + centered. */}
        <div className={`w-full shrink-0 flex flex-col gap-3 min-w-0 ${theaterMode ? "lg:w-[86%] lg:mx-auto" : "lg:w-[74%]"}`}>

          {/* ─── PLAYER ─── */}
          {/* Normal mode: 74% width, aspect-ratio 16/9.
              Theater mode: 86% width (wider), content drops below. */}
          <div
            className={`relative w-full max-sm:w-[calc(100%+1rem)] max-sm:-mx-2 shrink-0 overflow-hidden bg-black rounded-none sm:rounded-xl border-x-0 border-y sm:border border-white/[0.06] ${lightsOff ? "z-40" : ""}`}
            style={{ aspectRatio: "16 / 9" }}
          >
            {/* Inner wrapper — fills the parent in both modes. The outer div
                handles the centering + max-width in theater mode. */}
            <div className="absolute inset-0">
            {streamData && streamData.source_type === "hls" && streamData.video_link && (
              <HLSPlayerNew
                key={`hls-${animeId}-${episodeNum}-${selectedServer}`}
                url={proxifyM3u8(streamData.video_link)}
                animeId={animeId}
                episodeNum={episodeNum}
                animeTitle={animeTitle}
                sourceType="hls"
                intro={streamData.intro}
                outro={streamData.outro}
                allStreams={streamData.hls_sources?.map((s: any) => ({
                  url: proxifyM3u8(s.url), quality: s.quality || "Auto", label: s.label || s.quality || "Auto",
                })) || []}
                subtitleTracks={(() => {
                  // HARDSUB SERVERS: subtitles are burned into the video.
                  // Don't show external subtitle tracks — they'd overlap with
                  // the burned-in ones and the user can't disable the burned-in
                  // subs. Return empty so no CC button appears.
                  if (streamData.hardsub) {
                    console.log(`[Subtitles] Server is hardsub (subs burned into video) — hiding external subs`);
                    return [];
                  }

                  // Get subtitle tracks from the current server
                  let tracks = (streamData.subtitle_tracks || []).filter(
                    (t: any) => {
                      // Defensive: drop subtitles on Cloudflare-blocked hosts
                      // that 403 even with correct Referer (server IP triggers
                      // CF bot challenge). Better to show no subs than a broken
                      // CC button that silently fails.
                      if (typeof t.url === "string" && t.url.includes("kryntal.top")) return false;
                      return true;
                    }
                  );
                  
                  // If no subtitles, try to find subtitles from other servers in serverList
                  // (e.g. Chopper HD-2 has working subtitles on cdn.anizara.store)
                  // BUT only if the current server is NOT hardsub (checked above).
                  if (tracks.length === 0 && serverList) {
                    const serverWithSubs = serverList.find(
                      (s: any) => s.subtitleTracks && s.subtitleTracks.length > 0
                    );
                    if (serverWithSubs) {
                      tracks = serverWithSubs.subtitleTracks;
                      console.log(`[Subtitles] No subs on current server, using ${serverWithSubs.name}'s subtitles (${tracks.length} tracks)`);
                    }
                  }

                  return tracks.map((s: any) => {
                    // Defensive URL normalization:
                    // 1. If URL already starts with /api/, /, blob:, data: → use as-is
                    // 2. If URL is the broken "https://api.luffytv.live/sub?url=..." format
                    //    (which returns Next.js HTML instead of VTT) → extract the inner
                    //    url + ref params and re-wrap through /api/stream with the right referer
                    // 3. Otherwise → wrap through /api/stream?url={encoded}
                    let finalUrl = s.url;
                    if (finalUrl && typeof finalUrl === "string") {
                      if (
                        String(finalUrl).startsWith("/api/") ||
                        String(finalUrl).startsWith("/") ||
                        String(finalUrl).startsWith("blob:") ||
                        String(finalUrl).startsWith("data:")
                      ) {
                        // Already a local/proxied URL — use as-is
                      } else if (finalUrl.includes("/sub?url=") && finalUrl.includes("api.luffytv.live")) {
                        // Broken /sub endpoint format — extract inner url + ref params
                        try {
                          const subUrl = new URL(finalUrl);
                          const innerUrl = subUrl.searchParams.get("url");
                          const innerRef = subUrl.searchParams.get("ref");
                          if (innerUrl) {
                            finalUrl = `/api/stream?url=${encodeURIComponent(innerUrl)}${innerRef ? `&referer=${encodeURIComponent(innerRef)}` : ""}`;
                          }
                        } catch {
                          // URL parse failed — fall through to default wrapping
                          finalUrl = `/api/stream?url=${encodeURIComponent(finalUrl)}`;
                        }
                      } else {
                        // Standard case — wrap through /api/stream with referer.
                        // The referer from the server's data is stored in streamData
                        // but the subtitle URL might come from a different host that
                        // needs a specific referer. Use megaplay.buzz as default
                        // for Inazuma/megaplay subtitles.
                        const subReferer = streamData?.megaplayFileId
                          ? "https://megaplay.buzz/"
                          : "https://anikoto.to/";
                        finalUrl = `/api/stream?url=${encodeURIComponent(finalUrl)}&referer=${encodeURIComponent(subReferer)}`;
                      }
                    }
                    return {
                      url: finalUrl,
                      lang: s.label || "en",
                      label: s.label || "English",
                    };
                  });
                })()}
                onEnded={handleVideoEnded}
                onProviderFailed={() => handleProviderFailed(activeProvider)}
                onCanPlay={onCanPlay}
                autoplay={autoPlay}
                autoSkip={autoSkip}
                megaplayFileId={streamData?.megaplayFileId}
                megaplayAudio={streamData?.megaplayAudio as 'sub' | 'dub' | undefined}
                prevEp={prevEp}
                nextEp={nextEp}
                onPrevEp={() => prevEp && switchEpisode(prevEp)}
                onNextEp={() => nextEp && switchEpisode(nextEp)}
                onTheaterMode={(active: boolean) => setTheaterMode(active)}
                theaterMode={theaterMode}
              />
            )}
            {streamData && streamData.source_type === "mp4" && streamData.video_link && (
              <HLSPlayerNew
                key={`mp4-${animeId}-${episodeNum}-${selectedServer}`}
                url={proxify(streamData.video_link, "raw")}
                animeId={animeId}
                episodeNum={episodeNum}
                sourceType="mp4"
                intro={streamData.intro}
                outro={streamData.outro}
                onEnded={handleVideoEnded}
                onProviderFailed={() => handleProviderFailed(activeProvider)}
                onCanPlay={onCanPlay}
                autoplay={autoPlay}
                autoSkip={autoSkip}
              />
            )}
            {streamData && streamData.source_type === "embed" && streamData.video_link && (
              <EmbedPlayerWithFallback
                key={`embed-${activeProvider}-${episodeNum}-${translation}`}
                src={streamData.video_link}
                animeTitle={animeTitle}
                episodeNum={episodeNum}
                provider={activeProvider}
                providersForCurrentEp={providersForCurrentEp}
                failedProviders={failedProviders}
                onProviderFailed={handleProviderFailed}
                onProviderSelect={handleProviderSelect}
                getProviderDisplayName={getProviderDisplayName}
              />
            )}
            {streamData && streamData.source_type === "dash" && streamData.video_link && (
              <DashPlayer
                key={`dash-${animeId}`}
                url={streamData.video_link}
                subtitleTracks={streamData.subtitle_tracks || []}
                onEnded={handleVideoEnded}
                autoplay={autoPlay}
              />
            )}

            {/* Loading — only shows when NO player is mounted yet (streamData is null).
                Once streamData arrives, the HLS player's own "Buffering..." spinner takes over.
                This prevents double spinners (blue shell spinner on top of white HLS spinner). */}
            {!streamData && streamLoading && !streamError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <div className="w-12 h-12 border-2 border-white/10 rounded-full animate-spin border-t-white" style={{ animationDuration: '0.8s' }} />
              </div>
            )}

            {/* Episode switch overlay — solid black, covers old video completely.
                Old episode PAUSES (bg-black/90 + pointer-events-auto) so user
                doesn't see/hear old episode while new one loads. */}
            {streamData && streamLoading && !streamError && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 backdrop-blur-sm pointer-events-auto">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-2 border-white/10 rounded-full animate-spin border-t-white" style={{ animationDuration: '0.8s' }} />
                  <p className="text-xs text-white/60 font-medium">Loading episode {episodeNum}...</p>
                </div>
              </div>
            )}

            {/* 404 — TRY SWITCHING PROVIDER (Miruro-style error state) */}
            {streamError && !streamLoading && (
              <div className="absolute inset-0 z-20 bg-black">
                {animeImage && (
                  <div
                    className="absolute inset-0 opacity-25"
                    style={{ backgroundImage: `url(${animeImage})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(2px) brightness(0.7)" }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/60" />
                <div className="relative h-full flex flex-col items-center justify-center gap-1 px-6 text-center">
                  <div className="font-black leading-none select-none" style={{ fontSize: "clamp(56px, 12vw, 120px)", textShadow: "0 4px 40px rgba(0,0,0,0.8)" }}>404</div>
                  <div className="text-sm md:text-base font-bold tracking-[0.3em] uppercase text-white/90" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.8)" }}>Try Switching Provider</div>
                  <p className="text-[11px] text-white/50 mt-2 max-w-sm line-clamp-2">{streamError}</p>
                  <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
                    <button
                      onClick={() => { setStreamError(null); setStreamLoading(true); setScraperFallbackToken((t: number) => t + 1); }}
                      className="px-5 h-9 rounded-full text-xs font-bold text-white transition-all hover:brightness-110"
                      style={{ background: ACCENT_SOLID }}
                    >
                      Retry
                    </button>
                    {altServers.map((s: any) => (
                      <button
                        key={s.id}
                        onClick={() => { setSelectedServer(s.id); setStreamError(null); }}
                        className="px-4 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-white/85 transition-all"
                      >
                        ⚡ {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Close inner wrapper (theater mode centered box) */}
          </div>

          {/* ─── TOGGLES BAR — right under player ─── */}
          <div className="flex items-center gap-2 sm:gap-3.5 py-2 sm:py-2.5 px-2.5 sm:px-3.5 bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-x-auto scrollbar-hide">
            <ToggleCheck label="Autoplay" state={autoPlay} onToggle={() => setAutoPlay(!autoPlay)} />
            <ToggleCheck label="Auto Next" state={autoNext} onToggle={() => setAutoNext(!autoNext)} />
            <div className="hidden sm:block w-px h-5 bg-white/[0.08] shrink-0" />
            <ToggleCheck label="Auto Skip" state={autoSkip} onToggle={() => setAutoSkip(!autoSkip)} />
            <ToggleCheck label="Skip Filler" state={skipFiller} onToggle={() => setSkipFiller(!skipFiller)} />
            <ToggleCheck label="Shortcuts" state={showShortcuts} onToggle={() => setShowShortcuts(!showShortcuts)} />
            <ToggleCheck label="Lights Off" state={lightsOff} onToggle={() => setLightsOff(!lightsOff)} />
            <ToggleCheck label="Retain Fullscreen" state={fullscreenRetain} onToggle={() => setFullscreenRetain(!fullscreenRetain)} />

            <div className="flex-1 shrink-0" />

            <div className="flex items-center gap-1 shrink-0">
              {prevEp && (
                <button onClick={() => switchEpisode(prevEp)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white text-xs font-medium transition-colors shrink-0" title="Previous episode (P)">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
                  <span className="hidden sm:inline">Prev</span>
                </button>
              )}
              {nextEp && (
                <button onClick={() => switchEpisode(nextEp)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white text-xs font-medium transition-colors" title="Next episode (N)">
                  <span className="hidden sm:inline">Next</span>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
                </button>
              )}
            </div>
          </div>

          {/* ─── EPISODE TITLE + AUDIO/SERVER DROPDOWNS ─── */}
          <div className="flex flex-col gap-2 sm:gap-3 px-1">
            {/* Title row — full width on mobile, flex-row on desktop */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
              {/* "1. Episode Title" */}
              <h1 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl -tracking-[0.02rem] leading-tight min-w-0 flex-1">
                <span className="text-white">{episodeNum}.</span>{" "}
                <span>{epTitle}</span>
              </h1>

              {/* AUDIO + SERVER dropdowns — stacked on mobile, side-by-side on desktop */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2 shrink-0 w-full sm:w-auto">
                <div className="flex flex-col gap-1 flex-1 sm:flex-none">
                  <span className="text-[9px] font-bold text-white/35 uppercase tracking-widest flex items-center gap-1">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1a7 7 0 0 1 14 0v1h-4v8h4a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z"/></svg>
                    Audio
                  </span>
                  <MenuSelect
                    value={translation}
                    options={audioOptions}
                    disabledIds={audioDisabled}
                    onChange={(id) => handleTranslationChange(id)}
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1 sm:flex-none">
                  <span className="text-[9px] font-bold text-white/35 uppercase tracking-widest flex items-center gap-1">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm0 8h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zm2-6v2h2V7H6zm0 8v2h2v-2H6z"/></svg>
                    Server ({serversForMode.length})
                    {streamLoading && (
                      <span className="inline-flex items-center gap-1 ml-1">
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ACCENT }} />
                        <span className="text-white/50 normal-case tracking-normal">loading…</span>
                      </span>
                    )}
                  </span>
                  <MenuSelect
                    value={selectedServer}
                    options={serversForMode.map((s: any) => ({ id: s.id, label: `⚡ ${s.name}` }))}
                    onChange={(id) => { setSelectedServer(id); setStreamError(null); }}
                  />

                </div>
              </div>
            </div>

            {/* Meta chips + actions row */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {currentEp?.airDate && (
                <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-white/[0.06] border border-white/[0.07] text-[10px] sm:text-[11px] font-bold text-white/70">{currentEp.airDate}</span>
              )}
              {subCount > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-white/[0.06] border border-white/[0.07] text-[10px] sm:text-[11px] font-bold text-white/70" title="Subbed episodes">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM10 13H6v-2h4v2zm8 0h-6v-2h6v2zm0-4H6V7h12v2z"/></svg>
                  {subCount}
                </span>
              )}
              {dubCount > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-white/[0.06] border border-white/[0.07] text-[10px] sm:text-[11px] font-bold text-white/70" title="Dubbed episodes">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
                  {dubCount}
                </span>
              )}

              <div className="flex-1" />

              {/* Share button — always visible, compact on mobile */}
              <button onClick={handleShare} className="flex items-center gap-1 h-7 sm:h-8 px-2 sm:px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.07] text-[10px] sm:text-[11px] font-bold text-white/70 hover:text-white transition-all">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                {shareCopied ? "Copied!" : "Share"}
              </button>
              <button
                onClick={() => window.dispatchEvent(new Event("w2g:open"))}
                className="flex items-center gap-1.5 h-7 sm:h-8 px-2 sm:px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-[10px] sm:text-[11px] font-bold text-amber-300 hover:text-amber-200 transition-all"
                title="Watch this episode together with friends"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Watch Together
              </button>
              {/* Report — opens modal with problem description */}
              <button onClick={handleReport} className="flex items-center gap-1.5 h-7 sm:h-8 px-2 sm:px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.07] text-[10px] sm:text-[11px] font-bold text-white/70 hover:text-white transition-all" title="Report a playback issue">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
                {reportCopied ? "Sent!" : "Report"}
              </button>
              {/* Download — opens download modal */}
              <button onClick={() => setShowDownloadModal(true)} className="flex items-center gap-1.5 h-7 sm:h-8 px-2 sm:px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.07] text-[10px] sm:text-[11px] font-bold text-white/70 hover:text-white transition-all" title="Download this episode">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                Download
              </button>
            </div>

            {/* Episode synopsis */}
            {currentEp?.description && (
              <div className="cursor-pointer" onClick={() => setEpSynopsisExpanded(!epSynopsisExpanded)}>
                <p className={`text-[13px] text-white/60 leading-relaxed select-text ${epSynopsisExpanded ? "" : "line-clamp-3"}`}>
                  {currentEp.description}
                </p>
              </div>
            )}
          </div>

          {/* ─── ANIME INFO CARD ─── */}
          <div className="flex gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.07] mt-1">
            {/* Cover */}
            <button
              onClick={() => navigate({ page: "anime", id: String(animeId) })}
              className="shrink-0 w-[110px] sm:w-[140px] aspect-[2/3] rounded-lg overflow-hidden bg-white/5 border border-white/10 hover:border-white/30 transition-all self-start"
              title={`View ${animeTitle}`}
            >
              {animeImage
                ? <img src={animeImage} alt={animeTitle} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-white/15 text-xs">No cover</div>}
            </button>

            {/* Info */}
            <div className="flex flex-col gap-2.5 min-w-0 flex-1">
              <button onClick={() => navigate({ page: "anime", id: String(animeId) })} className="text-left group">
                <h2 className="font-black uppercase text-xl sm:text-2xl xl:text-3xl leading-tight -tracking-[0.01em] group-hover:text-white/80 transition-colors line-clamp-2">
                  {animeTitle}
                </h2>
                {animeTitleRomaji && (
                  <p className="italic text-white/40 text-xs sm:text-sm mt-0.5 line-clamp-1 uppercase tracking-wide">{animeTitleRomaji}</p>
                )}
              </button>

              {/* Genre chips — warm amber like the reference */}
              {animeGenres?.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {animeGenres.slice(0, 6).map((g: string) => (
                    <button
                      key={g}
                      onClick={() => navigate({ page: "genre", genre: g })}
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all hover:brightness-125"
                      style={{ background: "rgba(217, 119, 6, 0.18)", color: "#FBBF24", border: "1px solid rgba(217, 119, 6, 0.35)" }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}

              {/* Meta row */}
              <div className="flex items-center gap-2 text-xs font-medium flex-wrap text-white/55">
                {animeScore ? (
                  <span className="flex items-center gap-1 text-white">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" style={{ color: "#FBBF24" }}><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                    {animeScore}%
                  </span>
                ) : null}
                {animeSeason && <><span className="text-white/20">·</span><span>{animeSeason}</span></>}
                {animeType && <><span className="text-white/20">·</span><span>{animeType}</span></>}
                {animeEpisodes ? <><span className="text-white/20">·</span><span>{animeEpisodes} eps</span></> : null}
                {animeDuration ? <><span className="text-white/20">·</span><span>{animeDuration}m</span></> : null}
                {animeStatus === "RELEASING" && (
                  <>
                    <span className="text-white/20">·</span>
                    <span className="inline-flex items-center gap-1" style={{ color: "#34D399" }}>
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#34D399" }} />
                      Airing
                    </span>
                  </>
                )}
                {animeStudios?.length > 0 && <><span className="text-white/20">·</span><span className="text-white/40">{animeStudios.join(", ")}</span></>}
              </div>

              {/* Description */}
              {animeDescription && (
                <div className="cursor-pointer" onClick={() => setInfoExpanded(!infoExpanded)}>
                  <p className={`text-[13px] text-white/55 leading-relaxed select-text ${infoExpanded ? "" : "line-clamp-3 sm:line-clamp-4"}`}>
                    {animeDescription.replace(/<[^>]*>/g, "")}
                  </p>
                  <span className="text-[11px] text-white/35 hover:text-white/70 font-bold transition-colors">
                    {infoExpanded ? "Show less" : "Read more"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ─── COMMENTS — shown inside left column only on desktop ─── */}
          {animeId && (
            <div className="w-full flex flex-col gap-4 mt-2 hidden lg:block">
              <AnimeComments animeId={String(animeId)} animeTitle={animeTitle || "this anime"} episode={episodeNum} />
            </div>
          )}
        </div>{/* end left column */}

        {/* ══ RIGHT COLUMN — Episodes + Related + Recommendations ══ */}
        {/* In theater mode: 86% width + centered (matches player).
            In normal mode: 26% sidebar beside the player. */}
        <aside className={`w-full shrink-0 flex flex-col gap-5 min-w-0 ${theaterMode ? "lg:w-[86%] lg:mx-auto" : "lg:w-[26%]"}`}>

          {/* Episodes panel — fixed height so Related shows below */}
          <div className="h-[min(78vh,820px)]">
            <MiruroEpisodeSidebar
              episodeList={episodeList}
              filteredEps={filteredEps}
              epSearch={epSearch}
              setEpSearch={setEpSearch}
              switchEpisode={switchEpisode}
              episodeNum={episodeNum}
              nextEp={nextEp}
              animeImage={animeImage}
              visibleEpCount={visibleEpCount}
              setVisibleEpCount={setVisibleEpCount}
              softsubAvailable={softsubAvailable}
              hardsubAvailable={hardsubAvailable}
              dubAvailable={dubAvailable}
              animeNextAiring={animeNextAiring}
              countdown={countdown}
            />
          </div>

          {/* RELATED */}
          {relations?.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <h3 className="flex items-center gap-1 text-base font-black tracking-wide uppercase">
                <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 18l6-6-6-6"/></svg>
                Related
              </h3>
              <div className="flex flex-col gap-2">
                {relations.slice(0, 6).map((rel: any, idx: number) => (
                  <SideMediaCard key={`${rel.id}-${idx}`} item={rel} subtitle={rel.relationType?.replace(/_/g, " ")} navigate={navigate} />
                ))}
              </div>
            </div>
          )}

          {/* RECOMMENDATIONS */}
          {recommendations?.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <h3 className="flex items-center gap-1 text-base font-black tracking-wide uppercase">
                <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 18l6-6-6-6"/></svg>
                Recommendations
              </h3>
              <div className="flex flex-col gap-2">
                {recommendations.slice(0, 8).map((rec: any, idx: number) => (
                  <SideMediaCard key={`${rec.id}-${idx}`} item={rec} navigate={navigate} />
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ─── MOBILE-ONLY COMMENTS ─── */}
        {animeId && (
          <div className="w-full flex flex-col gap-4 mt-2 lg:hidden">
            <AnimeComments animeId={String(animeId)} animeTitle={animeTitle || "this anime"} episode={episodeNum} />
          </div>
        )}

      </div>{/* end two-column row */}

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="w-full max-w-sm mx-4 rounded-xl bg-black border border-white/10 shadow-2xl overflow-hidden" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-sm font-bold text-white">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="p-1 rounded text-white/40 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { key: "N", desc: "Next episode" }, { key: "P", desc: "Previous episode" },
                { key: "Space / K", desc: "Play / Pause" }, { key: "F", desc: "Fullscreen" },
                { key: "M", desc: "Mute / Unmute" }, { key: "?", desc: "Toggle this panel" },
              ].map(s => (
                <div key={s.key} className="flex items-center justify-between">
                  <span className="text-xs text-white/55">{s.desc}</span>
                  <kbd className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-mono font-bold text-white border border-white/10">{s.key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Report modal — problem description form */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowReportModal(false)}>
          <div className="w-full max-w-md mx-4 rounded-xl bg-[#1a1a2e] border border-white/10 shadow-2xl overflow-hidden" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
                Report Playback Issue
              </h3>
              <button onClick={() => setShowReportModal(false)} className="p-1 rounded text-white/40 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-xs text-white/50">
                Reporting: <span className="text-white/80 font-medium">{animeTitle}</span> — Episode {episodeNum}
                {selectedServer && <span className="text-white/40"> [{selectedServer}]</span>}
              </div>
              {reportSubmitted ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  <span className="text-sm text-emerald-400 font-medium">Report sent! We'll look into it.</span>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-white/60">What's the problem?</label>
                    <textarea
                      value={reportDescription}
                      onChange={(e) => setReportDescription(e.target.value)}
                      placeholder="e.g. Video won't play, wrong episode, no subtitles..."
                      className="w-full h-24 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/10 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-purple-500/50 transition-colors"
                      maxLength={500}
                    />
                    <div className="text-right text-[10px] text-white/30">{reportDescription.length}/500</div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowReportModal(false)} className="px-4 py-2 rounded-lg text-xs font-bold text-white/60 hover:text-white border border-white/10 hover:border-white/20 transition-all">Cancel</button>
                    <button onClick={submitReport} className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-amber-500/80 hover:bg-amber-500 transition-all">Send Report</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Download modal — black, real AnimeX download links (Google Drive, Mega, etc.) */}
      {showDownloadModal && (
        <WatchPageDownloadModal
          animeId={String(animeId || '')}
          animeTitle={animeTitle || ''}
          episodeNum={episodeNum || 1}
          onClose={() => setShowDownloadModal(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// MiruroEpisodeSidebar — episode list panel
//   - Bordered cards, spoiler blur w/ eye toggle
//   - 1-100 range dropdown for long anime
//   - Filter search
//   - Next-episode countdown footer bar
// ============================================================

type EpisodeViewMode = "card" | "block" | "list";

function MiruroEpisodeSidebar({
  episodeList, filteredEps, epSearch, setEpSearch, switchEpisode,
  episodeNum, nextEp, animeImage, visibleEpCount, setVisibleEpCount,
  softsubAvailable, hardsubAvailable, dubAvailable,
  animeNextAiring, countdown,
}: any) {
  const EPS_PER_PAGE = 100;
  const totalEps = episodeList?.length || 0;
  const totalPages = Math.ceil(totalEps / EPS_PER_PAGE);

  const [spoilerOn, setSpoilerOn] = useState(true); // spoiler blur on by default
  // View mode: "card" (picture + text), "block" (number grid), "list" (compact rows)
  const [viewMode, setViewMode] = useState<EpisodeViewMode>("card");
  // Search toggle — hidden by default, user clicks the magnifier to reveal
  const [showSearch, setShowSearch] = useState(false);
  // Range window starts at the page containing the current episode
  // (e.g. open One Piece EP 540 → show 501-600)
  const [page, setPage] = useState(() => Math.max(0, Math.floor((episodeNum - 1) / EPS_PER_PAGE)));
  const [showPageMenu, setShowPageMenu] = useState(false);
  const pageMenuBtnRef = useRef<HTMLButtonElement>(null);
  // Compute dropdown position at render time from the trigger ref
  // (avoids state race condition where dropdown renders before position is set)
  const pageMenuPos = useMemo(() => {
    if (!showPageMenu || !pageMenuBtnRef.current) return { top: 0, left: 0, width: 0 };
    const rect = pageMenuBtnRef.current.getBoundingClientRect();
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    return {
      top: rect.bottom + 4,
      left: isMobile ? 8 : rect.left,
      width: isMobile ? Math.min(200, (typeof window !== 'undefined' ? window.innerWidth : 375) - 16) : Math.max(100, rect.width),
    };
  }, [showPageMenu]);
  const listRef = useRef<HTMLDivElement | null>(null);

  // When search is opened, focus the input
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  // Derived-state adjustment during render (React's documented pattern):
  // when the episode changes, jump the range window to its page.
  // Search doesn't need a reset — pagination is bypassed while searching.
  const [prevEpNum, setPrevEpNum] = useState(episodeNum);
  if (prevEpNum !== episodeNum) {
    setPrevEpNum(episodeNum);
    const target = Math.floor((episodeNum - 1) / EPS_PER_PAGE);
    if (target >= 0) setPage(target);
  }

  // Apply pagination: if not searching and >100 eps, show only current page
  const pagedEps = (() => {
    if (epSearch) return filteredEps; // search bypasses pagination
    if (totalPages <= 1) return filteredEps;
    const start = page * EPS_PER_PAGE;
    return filteredEps?.slice(start, start + EPS_PER_PAGE) || [];
  })();

  const pageLabel = totalPages > 1
    ? `${page * EPS_PER_PAGE + 1} - ${Math.min((page + 1) * EPS_PER_PAGE, totalEps)}`
    : `1 - ${totalEps}`;

  // Countdown footer: "Episode 1170 in 6d 17h · Sun, Jul 12, 06:22"
  const countdownShort = (countdown || "").split(" ").slice(0, 2).join(" ");
  // ── Fix hydration mismatch: new Date().toLocaleString() uses different
  // timezones on server vs client → React error #418 → modal state updates
  // don't work. Compute airDateLabel ONLY on the client (after mount).
  // ──
  const [airDateLabel, setAirDateLabel] = useState("");
  useEffect(() => {
    if (animeNextAiring?.airingAt) {
      setAirDateLabel(new Date(animeNextAiring.airingAt * 1000).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }));
    } else {
      setAirDateLabel("");
    }
  }, [animeNextAiring?.airingAt]);

  return (
    <div className="flex flex-col w-full h-full bg-white/[0.02] rounded-xl border border-white/[0.06] overflow-hidden">
      {/* ─── Header: Up Next + view toggle + search + spoiler toggle ─── */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06] gap-2">
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="text-sm font-bold line-clamp-1">
            {nextEp ? `Up Next` : `Now Playing`}
          </div>
          <div className="text-xs text-white/40 line-clamp-1">
            {filteredEps?.find((ep: any) => ep.number === (nextEp || episodeNum))?.title || `Episode ${nextEp || episodeNum}`}
          </div>
        </div>

        {/* Action buttons cluster — search toggle + view modes + spoiler */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Search toggle button */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${showSearch ? 'bg-white/15 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
            title="Search episodes"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </button>

          {/* View mode toggle — 3 icons (card / block / list) */}
          <div className="flex items-center gap-0.5 bg-white/5 rounded-md p-0.5">
            {/* Card view — grid of picture cards */}
            <button
              onClick={() => setViewMode("card")}
              className={`w-6 h-6 rounded flex items-center justify-center transition-all ${viewMode === 'card' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
              title="Card view (picture + title)"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
            {/* Block view — compact number grid */}
            <button
              onClick={() => setViewMode("block")}
              className={`w-6 h-6 rounded flex items-center justify-center transition-all ${viewMode === 'block' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
              title="Block view (numbers only)"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="10" y="3" width="5" height="5" rx="1"/><rect x="17" y="3" width="5" height="5" rx="1"/><rect x="3" y="10" width="5" height="5" rx="1"/><rect x="10" y="10" width="5" height="5" rx="1"/><rect x="17" y="10" width="5" height="5" rx="1"/><rect x="3" y="17" width="5" height="5" rx="1"/><rect x="10" y="17" width="5" height="5" rx="1"/><rect x="17" y="17" width="5" height="5" rx="1"/></svg>
            </button>
            {/* List view — compact horizontal rows */}
            <button
              onClick={() => setViewMode("list")}
              className={`w-6 h-6 rounded flex items-center justify-center transition-all ${viewMode === 'list' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
              title="List view (compact rows)"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>

          {/* Spoiler eye toggle */}
          <button
            onClick={() => setSpoilerOn(!spoilerOn)}
            className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${spoilerOn ? 'bg-white/10 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
            title={spoilerOn ? 'Spoilers hidden — click to show' : 'Spoilers visible — click to hide'}
          >
            {spoilerOn ? (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" /></svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2z" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* ─── Pagination + Search row — pagination always shows, search is toggleable ─── */}
      {(totalPages > 1 || showSearch) && (
        <div className="flex items-center px-3 py-2 gap-2 border-b border-white/[0.06]">
          {/* Range dropdown (1-100) — only if >100 episodes */}
          {totalPages > 1 && (
            <div className="relative shrink-0">
              <button
                ref={pageMenuBtnRef}
                onClick={() => setShowPageMenu(!showPageMenu)}
                style={{ touchAction: 'manipulation' }}
                className="flex items-center gap-1 bg-white/[0.06] hover:bg-white/[0.1] active:bg-white/[0.15] h-8 px-3 rounded-lg text-xs font-bold text-white/80 transition-all select-none"
              >
                {pageLabel}
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z" /></svg>
              </button>
              {showPageMenu && (
                <>
                  <div
                    className="fixed inset-0"
                    style={{ zIndex: 9998 }}
                    onClick={() => setShowPageMenu(false)}
                    onTouchEnd={(e) => { e.preventDefault(); setShowPageMenu(false); }}
                  />
                  <div
                    className="fixed bg-black/80 backdrop-blur-xl border border-white/15 rounded-lg overflow-hidden py-1 shadow-2xl max-h-[300px] overflow-y-auto"
                    style={{ zIndex: 9999, top: pageMenuPos.top, left: pageMenuPos.left, width: pageMenuPos.width }}
                  >
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => { setPage(i); setShowPageMenu(false); listRef.current?.scrollTo({ top: 0 }); }}
                        style={{ touchAction: 'manipulation' }}
                        className={`block w-full text-left px-3 py-3 sm:py-1.5 text-xs hover:bg-white/10 active:bg-white/10 transition-colors select-none ${page === i ? 'font-bold' : 'text-white/60'}`}
                      >
                        {i * EPS_PER_PAGE + 1} - {Math.min((i + 1) * EPS_PER_PAGE, totalEps)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Filter episodes search — only visible when showSearch is true */}
          {showSearch && (
            <div className="flex grow items-center bg-white/[0.04] hover:bg-white/[0.06] focus-within:bg-white/[0.06] h-8 rounded-lg overflow-hidden px-2.5">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-white/30 shrink-0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input
                ref={searchInputRef}
                type="text"
                value={epSearch}
                onChange={(e: any) => { setEpSearch(e.target.value); setVisibleEpCount(50); }}
                placeholder="Filter episodes..."
                className="w-full px-2 bg-transparent text-xs text-white placeholder-white/30 focus:outline-none"
              />
              {epSearch && (
                <button
                  onClick={() => { setEpSearch(""); setShowSearch(false); }}
                  className="shrink-0 ml-1 text-white/40 hover:text-white"
                  title="Clear and close search"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Episode list — scrollable, renders based on viewMode ─── */}
      <div className="flex flex-col overflow-hidden flex-1 min-h-0">
        <div
          ref={listRef}
          className={`overflow-y-auto overscroll-y-contain flex-1 min-h-0 p-2 ${
            viewMode === "block" ? "grid grid-cols-4 gap-1.5" : "flex flex-col gap-2"
          }`}
          onScroll={(e: any) => {
            const el = e.target;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
              setVisibleEpCount((prev: number) => Math.min(prev + 50, pagedEps?.length || 0));
            }
          }}
        >
          {pagedEps?.length > 0 ? (
            pagedEps.slice(0, visibleEpCount).map((ep: any) => {
              if (viewMode === "block") {
                return (
                  <EpisodeBlock
                    key={ep.number}
                    ep={ep}
                    isActive={ep.number === episodeNum}
                    onClick={() => switchEpisode(ep.number)}
                  />
                );
              }
              if (viewMode === "list") {
                return (
                  <EpisodeListRow
                    key={ep.number}
                    ep={ep}
                    isActive={ep.number === episodeNum}
                    onClick={() => switchEpisode(ep.number)}
                  />
                );
              }
              return (
                <EpisodeCard
                  key={ep.number}
                  ep={ep}
                  isActive={ep.number === episodeNum}
                  spoilerOn={spoilerOn}
                  animeImage={animeImage}
                  softsubAvailable={softsubAvailable}
                  hardsubAvailable={hardsubAvailable}
                  dubAvailable={dubAvailable}
                  onClick={() => switchEpisode(ep.number)}
                />
              );
            })
          ) : (
            <div className={`text-center py-12 ${viewMode === "block" ? "col-span-4" : ""}`}>
              <p className="text-white/30 text-xs">{episodeList?.length === 0 ? "Loading episodes..." : "No episodes found"}</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Next-episode countdown footer ─── */}
      {animeNextAiring && countdownShort && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-white/[0.08] bg-white/[0.03] text-xs">
          <svg className="w-3.5 h-3.5 shrink-0" style={{ color: ACCENT }} viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
          <span className="font-bold text-white">
            Episode {animeNextAiring.episode} in {countdownShort}
          </span>
          {airDateLabel && (
            <>
              <span className="text-white/25">·</span>
              <span className="text-white/45 truncate">{airDateLabel}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Episode Card — horizontal: thumb (left, blurrable) | text ───
function EpisodeCard({ ep, isActive, spoilerOn, animeImage, softsubAvailable, hardsubAvailable, dubAvailable, onClick }: any) {
  const epThumb = ep.thumbnail || ep.image || "";
  const fallbackThumb = animeImage || "";
  const isFiller = !!ep.filler;

  // Active = purple, Filler = gold
  const cardStyle = isActive
    ? { background: "rgba(147, 51, 234, 0.12)", borderColor: "rgba(147, 51, 234, 0.5)" }
    : isFiller
    ? { background: "rgba(255, 215, 0, 0.06)", borderColor: "rgba(255, 215, 0, 0.3)" }
    : undefined;
  const cardClass = isActive
    ? "border-[#9333EA]/50"
    : isFiller
    ? "border-[#FFD700]/30 hover:border-[#FFD700]/50"
    : "border-white/10 hover:border-white/20 hover:bg-white/[0.04]";

  return (
    <button
      onClick={onClick}
      className={`flex flex-row w-full rounded-lg overflow-hidden border transition-all text-left shrink-0 ${cardClass}`}
      style={{ height: '100px', ...cardStyle }}
      title={`${ep.number}. ${ep.title || `Episode ${ep.number}`}`}
    >
      {/* THUMBNAIL (LEFT) — only this gets blurred */}
      <div className="relative shrink-0 overflow-hidden bg-white/[0.04]" style={{ width: '110px', height: '100%' }}>
        {epThumb ? (
          <img
            src={epThumb}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-300 ${spoilerOn ? 'blur-2xl scale-125 brightness-[0.3]' : ''}`}
            loading="lazy"
            onError={(e: any) => {
              if (fallbackThumb && e.target.src !== fallbackThumb) {
                e.target.src = fallbackThumb;
                e.target.style.opacity = '0.3';
              }
            }}
          />
        ) : fallbackThumb ? (
          <img src={fallbackThumb} alt="" className={`absolute inset-0 w-full h-full object-cover opacity-30 transition-all duration-300 ${spoilerOn ? 'blur-2xl scale-125' : ''}`} loading="lazy" />
        ) : (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center text-lg font-bold text-white/15">{ep.number}</div>
        )}

        {/* Spoiler overlay */}
        {spoilerOn && (epThumb || fallbackThumb) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/70 backdrop-blur-md rounded-full px-2 py-0.5 flex items-center gap-1">
              <svg className="w-2.5 h-2.5 text-white/70" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27z" /></svg>
              <span className="text-[8px] font-bold text-white/70 uppercase tracking-wider">Spoiler</span>
            </div>
          </div>
        )}

        {/* Active play overlay */}
        {isActive && !spoilerOn && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            </div>
          </div>
        )}

        {/* EP badge — purple for active, gold for filler */}
        <span className={`absolute left-1 bottom-1 backdrop-blur-sm text-[9px] font-bold px-1.5 py-0.5 rounded ${isActive ? "bg-[#9333EA] text-white" : isFiller ? "bg-[#FFD700]/80 text-black" : "bg-black/80 text-white"}`}>EP {ep.number}</span>
      </div>

      {/* TEXT SECTION (RIGHT) — never blurred */}
      <div className="flex flex-col flex-1 min-w-0 p-2.5 gap-1 justify-between">
        <div className={`text-xs font-bold line-clamp-1 leading-tight ${isActive ? "text-[#A78BFA]" : isFiller ? "text-[#FFD700]" : "text-white"}`}>
          {ep.title || `Episode ${ep.number}`}
        </div>
        <div className="text-[10px] text-white/45 line-clamp-2 leading-snug">
          {ep.description || `Episode ${ep.number} of the series.`}
        </div>
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {ep.airDate && (
              <span className="text-[9px] text-white/40 truncate">{ep.airDate}</span>
            )}
            {ep.filler && (
              <span className="text-[8px] text-white/30 font-medium shrink-0">Filler</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {softsubAvailable && (
              <span className="text-[8px] font-bold text-white/40 bg-white/[0.06] px-1 py-0.5 rounded" title="Subtitles available">CC</span>
            )}
            {hardsubAvailable && (
              <span className="text-[8px] font-bold text-white/40 bg-white/[0.06] px-1 py-0.5 rounded" title="Hardsub available">HS</span>
            )}
            {dubAvailable && (
              <span className="flex items-center gap-0.5 text-[8px] font-bold text-white/40 bg-white/[0.06] px-1 py-0.5 rounded" title="Dub available">
                <svg className="w-2 h-2" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" /></svg>
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Block view — compact number tiles in a grid (no thumbnail, no title) ───
// Useful for long anime (One Piece, Naruto) where you just want to jump to EP 540.
function EpisodeBlock({ ep, isActive, onClick }: any) {
  const isFiller = !!ep.filler;
  return (
    <button
      onClick={onClick}
      className={`relative aspect-square rounded-lg flex flex-col items-center justify-center transition-all text-center group ${
        isActive
          ? "bg-[#9333EA] text-white"
          : isFiller
          ? "bg-[#FFD700]/[0.08] text-[#FFD700] hover:bg-[#FFD700]/15 border border-[#FFD700]/30"
          : "bg-white/[0.04] text-white/80 hover:bg-white/[0.1] border border-white/[0.06] hover:border-white/15"
      }`}
      title={`${ep.number}. ${ep.title || `Episode ${ep.number}`}${isFiller ? " (Filler)" : ""}`}
    >
      <span className="text-sm font-extrabold tabular-nums">{ep.number}</span>
      {isFiller && !isActive && (
        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[#FFD700]" />
      )}
      {isActive && (
        <svg className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></svg>
      )}
    </button>
  );
}

// ─── List view — compact horizontal rows (episode number + title only, no thumbnail) ───
function EpisodeListRow({ ep, isActive, onClick }: any) {
  const isFiller = !!ep.filler;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-2.5 h-9 rounded-md border transition-all text-left shrink-0 ${
        isActive
          ? "bg-[#9333EA]/15 border-[#9333EA]/50"
          : isFiller
          ? "bg-[#FFD700]/[0.04] border-[#FFD700]/20 hover:bg-[#FFD700]/[0.08] hover:border-[#FFD700]/40"
          : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/15"
      }`}
      title={`${ep.number}. ${ep.title || `Episode ${ep.number}`}${isFiller ? " (Filler)" : ""}`}
    >
      {/* Episode number — fixed width so titles align */}
      <span
        className={`text-[11px] font-extrabold tabular-nums shrink-0 w-7 text-center px-1 py-0.5 rounded ${
          isActive
            ? "bg-[#9333EA] text-white"
            : isFiller
            ? "bg-[#FFD700]/15 text-[#FFD700]"
            : "bg-white/[0.06] text-white/70"
        }`}
      >
        {ep.number}
      </span>
      {/* Title — truncate */}
      <span
        className={`text-[12px] font-medium truncate flex-1 min-w-0 ${
          isActive ? "text-[#A78BFA]" : isFiller ? "text-[#FFD700]/80" : "text-white/80"
        }`}
      >
        {ep.title || `Episode ${ep.number}`}
      </span>
      {isFiller && (
        <span className="text-[8px] font-bold text-white/30 shrink-0 uppercase tracking-wider">Filler</span>
      )}
      {isActive && (
        <svg className="w-3 h-3 text-[#A78BFA] shrink-0" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></svg>
      )}
    </button>
  );
}

// ─── Watch Page Download Modal ──────────────────────────────────
// Black modal, fetches real download links from AnimeX API
// (Google Drive, Mega, Private Drive, etc.) — NO purple, NO proxy URLs
function WatchPageDownloadModal({ animeId, animeTitle, episodeNum, onClose }: {
  animeId: string; animeTitle: string; episodeNum: number; onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<Array<{ text: string; decodedUrl: string }>>([]);
  const [searchResults, setSearchResults] = useState<Array<{ id: string; title: string }>>([]);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [debugInfo, setDebugInfo] = useState('');

  useEffect(() => {
    const fetchDownloads = async () => {
      try {
        setLoading(true);
        setError('');
        setDebugInfo('');
        let title = animeTitle;

        // If no title, try AniList lookup
        if (!title && animeId) {
          try {
            const titleRes = await fetch('/api/anilist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: `query($id:Int){Media(id:$id,type:ANIME){title{english romaji}}}`,
                variables: { id: parseInt(animeId) },
              }),
            });
            if (titleRes.ok) {
              const titleData = await titleRes.json();
              title = titleData?.data?.Media?.title?.english || titleData?.data?.Media?.title?.romaji || '';
            }
          } catch { /* ignore */ }
        }

        if (!title) {
          setDebugInfo(`animeId=${animeId}, animeTitle="${animeTitle}"`);
          setError('Could not determine anime title');
          setLoading(false);
          return;
        }

        setDebugInfo(`Searching: "${title}"`);

        // Method 1: One-shot auto mode (search + get links in one call)
        try {
          const autoRes = await fetch(`/api/anime/download?title=${encodeURIComponent(title)}&auto=1`);
          if (autoRes.ok) {
            const autoData = await autoRes.json();
            if (autoData.links && autoData.links.length > 0) {
              setLinks(autoData.links);
              setLoading(false);
              return;
            }
          }
        } catch { /* fallthrough to search mode */ }

        // Method 2: Search mode — get results, then fetch links for first result
        const res = await fetch(`/api/anime/download?q=${encodeURIComponent(title)}`);
        if (!res.ok) {
          setError('Download API unavailable');
          setLoading(false);
          return;
        }
        const data = await res.json();
        const results = data.results || [];

        if (results.length === 0) {
          setError('No download links found for this anime');
          setLoading(false);
          return;
        }

        setSearchResults(results);

        // Auto-fetch links for the first (best) result
        const best = results[0];
        setSelectedId(best.id);
        setDebugInfo(`Found ${results.length} results, loading: "${best.title}"`);
        const linkRes = await fetch(`/api/anime/download?id=${encodeURIComponent(best.id)}`);
        if (linkRes.ok) {
          const linkData = await linkRes.json();
          if (linkData.links && linkData.links.length > 0) {
            setLinks(linkData.links);
          } else {
            setError('No download links available for this selection');
          }
        } else {
          setError('Failed to fetch download links');
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load downloads');
      } finally {
        setLoading(false);
      }
    };
    fetchDownloads();
  }, [animeId, animeTitle]);

  const quickLinks = links.slice(0, 8);

  const getLinkType = (url: string) => {
    if (url.includes('drive.google.com')) return { label: 'Google Drive', color: '#4285F4' };
    if (url.includes('mega.')) return { label: 'Mega', color: '#D9271E' };
    if (url.includes('1fichier')) return { label: '1Fichier', color: '#00AAFF' };
    if (url.includes('mediafire')) return { label: 'MediaFire', color: '#54A621' };
    if (url.includes('dropbox')) return { label: 'Dropbox', color: '#0061FF' };
    if (url.includes('animewat.ch') || url.includes('animeout')) return { label: 'AnimeOut', color: '#FF6B6B' };
    return { label: 'Direct Link', color: '#888' };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-black border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-white shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V5a3 3 0 0 0-6 0v4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 6v3h-2v-3H8l4-4 4 4h-3z" /></svg>
            <h3 className="text-sm font-bold text-white shrink-0">Download</h3>
            {animeTitle && <span className="text-[10px] text-white/30 font-medium truncate">{animeTitle}</span>}
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors shrink-0 ml-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        {/* Search results selector (if multiple) */}
        {searchResults.length > 1 && (
          <div className="px-4 py-2 border-b border-white/5 shrink-0">
            <select
              value={selectedId}
              onChange={async (e) => {
                const id = e.target.value;
                setSelectedId(id);
                setLoading(true);
                setError('');
                setLinks([]);
                try {
                  const res = await fetch(`/api/anime/download?id=${encodeURIComponent(id)}`);
                  if (res.ok) {
                    const data = await res.json();
                    if (data.links?.length > 0) {
                      setLinks(data.links);
                    } else {
                      setError('No links for this selection');
                    }
                  }
                } catch { setError('Failed to fetch links'); }
                setLoading(false);
              }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 focus:outline-none focus:border-white/20"
            >
              {searchResults.map((r) => (
                <option key={r.id} value={r.id} className="bg-black text-white">{r.title}</option>
              ))}
            </select>
          </div>
        )}

        {/* Body */}
        <div className="px-4 py-4 overflow-y-auto flex-1">
          {loading && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <span className="mt-2.5 text-xs text-white/50">Finding download links...</span>
              {debugInfo && <span className="mt-1 text-[9px] text-white/20">{debugInfo}</span>}
            </div>
          )}

          {error && !loading && (
            <div className="text-center py-6">
              <svg className="w-8 h-8 mx-auto text-white/10 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              <p className="text-xs text-white/40 mb-3">{error}</p>
              {debugInfo && <p className="text-[9px] text-white/15 mb-3">{debugInfo}</p>}
              <button
                onClick={() => { onClose(); useAppStore.getState().navigate({ page: 'download' }); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1E88FF]/15 text-[11px] font-semibold text-[#1E88FF] hover:bg-[#1E88FF]/25 transition-all"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V5a3 3 0 0 0-6 0v4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 6v3h-2v-3H8l4-4 4 4h-3z" /></svg>
                Browse Downloads
              </button>
            </div>
          )}

          {!loading && !error && quickLinks.length > 0 && (
            <div>
              <div className="space-y-2">
                {quickLinks.map((link, i) => {
                  const type = getLinkType(link.decodedUrl);
                  return (
                    <a
                      key={i}
                      href={link.decodedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/15 transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${type.color}15` }}>
                          <svg className="w-3 h-3" style={{ color: type.color }} viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V5a3 3 0 0 0-6 0v4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 6v3h-2v-3H8l4-4 4 4h-3z" /></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-white/80 truncate">
                            {link.text.split('|').pop()?.trim() || link.text}
                          </p>
                          <p className="text-[9px] truncate" style={{ color: type.color }}>{type.label}</p>
                        </div>
                        <svg className="w-3 h-3 text-white/30 group-hover:text-white/60 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </div>
                    </a>
                  );
                })}
              </div>

              {links.length > 8 && (
                <p className="text-center text-[10px] text-white/25 mt-2">+ {links.length - 8} more links</p>
              )}

              <div className="mt-3 pt-3 border-t border-white/8 text-center">
                <button
                  onClick={() => { onClose(); useAppStore.getState().navigate({ page: 'download' }); }}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/40 hover:text-white/60 transition-colors"
                >
                  Browse all downloads
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
