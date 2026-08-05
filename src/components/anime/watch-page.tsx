"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAppStore } from "./store";
import HLSPlayerNew from "./hls-player-new";
import AnimeComments from "./anime-comments";
import WatchPageExtras from "./watch-page-extras";
import { getProviderDisplayName } from "@/lib/miruro-api";
import { proxifyM3u8, proxify } from "@/lib/proxy";
import { WatchPageShell } from "./watch-page-shell";
import { validateSkipTime } from "@/lib/episode-metadata";

// ============================================================
// DASH PLAYER — for AnimeOnsen .mpd streams
// Dynamically loads dash.js from CDN, plays .mpd manifest
// ============================================================

declare global {
  interface Window { dashjs: any; }
}

function loadDashJs(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.dashjs) return resolve();
    const existing = document.querySelector('script[src*="dash.mediaplayer"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("dash.js load error")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.mediaplayer.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load dash.js"));
    document.head.appendChild(script);
  });
}

function DashPlayer({
  url,
  subtitleTracks,
  onEnded,
  autoplay = true,
}: {
  url: string;
  subtitleTracks?: Array<{ url: string; label: string; lang?: string }>;
  onEnded?: () => void;
  autoplay?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await loadDashJs();
        if (cancelled || !videoRef.current) return;

        const video = videoRef.current;
        const player = window.dashjs.MediaPlayer().create();
        player.initialize(video, url, autoplay);
        player.updateSettings({
          streaming: {
            buffer: {
              fastSwitchEnabled: true,
              bufferTimeAtTopQuality: 30,
              bufferTimeAtTopQualityLongForm: 60,
            },
          },
        });
        playerRef.current = player;
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Failed to load DASH player");
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try { playerRef.current.reset(); } catch {}
        playerRef.current = null;
      }
    };
  }, [url, autoplay]);

  return (
    <div className="absolute inset-0 w-full h-full bg-black">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="ltv-spinner ltv-spinner-lg" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-rose-400 text-sm">{error}</p>
            <button onClick={() => window.location.reload()} className="text-xs text-white/60 hover:text-white">
              Reload
            </button>
          </div>
        </div>
      )}
      <video
        ref={videoRef}
        className="w-full h-full"
        controls
        onEnded={onEnded}
        crossOrigin="anonymous"
      />
      {subtitleTracks && subtitleTracks.length > 0 && (
        <div className="absolute bottom-14 right-4 z-10 flex gap-1">
          {subtitleTracks.slice(0, 5).map((s) => (
            <button
              key={s.lang || s.label}
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                // Remove existing <track> elements from the DOM (not TextTrackList entries)
                const existingTracks = video.querySelectorAll("track");
                existingTracks.forEach(t => t.remove());
                const track = document.createElement("track");
                track.kind = "subtitles";
                track.label = s.label;
                track.srclang = s.lang || "en";
                track.src = s.url;
                track.default = true;
                video.appendChild(track);
              }}
              className="px-2 py-1 text-[10px] font-bold bg-black/60 text-white/70 hover:bg-white/20 hover:text-white rounded transition-colors"
            >
              {s.lang || s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// WATCH PAGE — Redesigned layout
// Player → Title/Nav → Tabs (Episodes/Info/Relations) → Servers
// ============================================================

interface WatchPageProps {
  animeId: string;
  episodeNum: number;
}

interface StreamData {
  video_link: string;
  source_type: "hls" | "embed" | "mp4" | "dash";
  hls_sources: Array<{
    url: string;
    quality: string;
    label: string;
    isM3U8: boolean;
    width?: number;
    height?: number;
  }>;
  embed_sources: Array<{
    url: string;
    quality: string;
    label: string;
    type: string;
  }>;
  subtitle_tracks: Array<{
    url: string;
    label: string;
    kind: "subtitles";
  }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
  provider: string;
  available_qualities: string[];
  tried_providers?: string[];
  all_providers?: string[];
  _fallback?: boolean;
}

interface EpisodeItem {
  number: number;
  title: string;
  filler: boolean;
  id: string;
  thumbnail?: string;
  description?: string;
  airDate?: string;
}

interface ProviderEpisodes {
  meta: { title: string };
  episodes: {
    sub: EpisodeItem[];
    dub: EpisodeItem[];
  };
}

interface RelationAnime {
  id: number;
  title: { english?: string; romaji?: string; native?: string };
  coverImage?: { extraLarge?: string; large?: string; medium?: string };
  relationType?: string;
  type?: string;
  format?: string;
  episodes?: number;
  status?: string;
  averageScore?: number;
}

type ContentTab = "info" | "relations";
type EpisodeSortOrder = "asc" | "desc";

// ── Embed Player with auto-fallback on 410/dead links ──
// If the embed source returns a dead page (410 Gone, etc.), shows a "switch server" overlay
function EmbedPlayerWithFallback({
  src,
  animeTitle,
  episodeNum,
  provider,
  providersForCurrentEp,
  failedProviders,
  onProviderFailed,
  onProviderSelect,
  getProviderDisplayName,
}: {
  src: string;
  animeTitle: string;
  episodeNum: number;
  provider: string;
  providersForCurrentEp: string[];
  failedProviders: Set<string>;
  onProviderFailed: (p: string) => void;
  onProviderSelect: (p: string) => void;
  getProviderDisplayName: (p: string) => string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [showServerOverlay, setShowServerOverlay] = useState(false);

  // Detect iframe load failure — embed sources often return 410 Gone
  useEffect(() => {
    const timer = setTimeout(() => {
      // After 8 seconds, if iframe loaded but content might be dead,
      // show the switch server button as a floating hint
      setShowServerOverlay(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [src]);

  const handleIframeLoad = useCallback(() => {
    // We can't read iframe content due to cross-origin, but we can
    // check if the URL might be a dead embed by doing a HEAD request
    try {
      fetch(src, { method: "HEAD", mode: "no-cors" }).catch(() => {});
    } catch {}
  }, [src]);

  const handleEmbedError = useCallback(() => {
    setEmbedFailed(true);
    onProviderFailed(provider);
  }, [provider, onProviderFailed]);

  const otherProviders = providersForCurrentEp.filter(
    p => p !== provider && !failedProviders.has(p)
  );

  if (embedFailed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
        <div className="text-center space-y-4 max-w-sm px-6">
          <div className="w-12 h-12 rounded-xl bg-[#ffffff]/10 border border-[#ffffff]/20 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-[#ffffff]/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-white/75 text-sm">This embed source is unavailable (410 Gone)</p>
          {otherProviders.length > 0 ? (
            <div className="flex flex-wrap gap-2 justify-center">
              {otherProviders.map(p => (
                <button
                  key={p}
                  onClick={() => onProviderSelect(p)}
                  className="px-3 py-1.5 rounded-lg bg-[#ffffff] text-black text-xs font-bold hover:bg-white/90 transition-colors"
                >
                  Try {getProviderDisplayName(p)}
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 rounded-lg bg-[#ffffff] text-black text-sm font-bold hover:bg-white/90 transition-colors"
            >
              Refresh Page
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <iframe
        ref={iframeRef}
        src={src}
        className="w-full h-full border-0"
        allowFullScreen
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        referrerPolicy="no-referrer-when-downgrade"
        title={`${animeTitle} - Episode ${episodeNum}`}
        onLoad={handleIframeLoad}
        onError={handleEmbedError}
      />
      {/* Floating "embed dead?" overlay — shows after 8s so user can switch servers */}
      {showServerOverlay && otherProviders.length > 0 && (
        <div className="absolute top-3 right-3 z-30">
          <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md rounded-lg border border-white/[0.08] px-3 py-2 shadow-xl">
            <span className="text-[10px] text-white/55">Embed not working?</span>
            {otherProviders.slice(0, 3).map(p => (
              <button
                key={p}
                onClick={() => onProviderSelect(p)}
                className="px-2.5 py-1 rounded-md bg-[#ffffff] text-black text-[10px] font-bold hover:bg-white/90 transition-colors"
              >
                {getProviderDisplayName(p)}
              </button>
            ))}
            <button
              onClick={() => setShowServerOverlay(false)}
              className="p-1 text-white/40 hover:text-white transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const PROVIDER_PRIORITY = [
  "zenith", "kiwi", "ax-mimi", "ax-wave", "ax-shiro", "ax-yuki", "ax-zen", "ax-beep",
  "bee", "miku", "zoro", "arc", "jet",
];

export default function WatchPage({ animeId, episodeNum }: WatchPageProps) {
  const navigate = useAppStore(s => s.navigate);
  const addToHistory = useAppStore(s => s.addToHistory);
  const updateHistoryProgress = useAppStore(s => s.updateHistoryProgress);
  // Player defaults come from Settings > Player and write back there, so the
  // in-player toggles and the Settings page stay in sync.
  const prefs = useAppStore(s => s.prefs);
  const setPref = useAppStore(s => s.setPref);

  // ── AniList ID ──
  const parsedId = (() => {
    const cleanId = animeId.replace(/^miruro_/, "").replace(/^mal_/, "");
    if (/^\d+$/.test(cleanId)) return parseInt(cleanId);
    return null;
  })();
  const [anilistId, setAnilistId] = useState<number | null>(parsedId);

  // ── Stream State ──
  const [streamData, setStreamData] = useState<StreamData | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [hasShownLoadingScreen, setHasShownLoadingScreen] = useState(false);
  const [activeProvider, setActiveProvider] = useState("kiwi");
  /**
   * Translation mode — 3-way toggle like AniDap/Anistream:
   *   "sub"     → Soft sub (subtitles as separate VTT track)
   *   "hardsub" → Hard sub (subtitles burned into video)
   *   "dub"     → English dub audio
   *
   * For backwards compatibility with the existing code that uses "sub"|"dub",
   * "sub" and "hardsub" both map to type="sub" servers (just filtered by
   * the `hardsub` flag on each server).
   */
  const [translation, setTranslation] = useState<"sub" | "hardsub" | "dub" | "hindi">("sub");
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [failedProviders, setFailedProviders] = useState<Set<string>>(new Set());
  const [dubAvailable, setDubAvailable] = useState(false);
  const [hardsubAvailable, setHardsubAvailable] = useState(false);
  const [softsubAvailable, setSoftsubAvailable] = useState(false);
  const [hindiAvailable, setHindiAvailable] = useState(false);
  const [streamLoading, setStreamLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);

  // ── Server List (Animex + AniVault + AniVexa + Senshi + AniDap + AniLight + Kyren — ALL verified) ──
  interface ServerEntry {
    id: string;
    name: string;
    source: "animex" | "anivault" | "anivexa" | "senshi" | "anidap" | "anilight" | "kyren" | "anikage" | "mioanime" | "anixtv" | "anistream" | "anikuro" | "anipm" | "animeheaven" | "aniwaves" | "anidb" | "anikoto" | "anineko" | "anineko-to" | "anichi" | "allmanga" | "animo4" | "animostream" | "anibd" | "watchanimeworld" | "uniquestream";
    provider: string;
    type: "sub" | "dub";
    quality?: string;
    streamUrl?: string;
    isM3U8?: boolean;
    isMP4?: boolean;
    isEmbed?: boolean;
    /** Embed hosts that allow framing and ignore Referer — skip the worker proxy */
    noProxy?: boolean;
    /** Whether to route through /api/embed/proxy for CF-protected embed sources */
    useEmbedProxy?: boolean;
    /** DASH manifest (.mpd) — needs dash.js instead of hls.js */
    isDASH?: boolean;
    /** Whether subtitles are burned into the video (hard sub) vs soft sub */
    hardsub?: boolean;
    /** AniDap/AniLight streams include WebVTT subtitle tracks + intro/outro chapters */
    subtitleTracks?: Array<{ url: string; lang: string; label: string }>;
    intro?: { start: number; end: number } | null;
    outro?: { start: number; end: number } | null;
  }
  /**
   * Servers from `incoming` that aren't already in `prev` — deduped WITHIN the
   * batch as well as against it.
   *
   * Filtering only against `prev` was not enough: providers can return the same
   * id twice in a single response (anichi was measured returning 5 servers with
   * 4 unique ids), and both copies passed the filter. React then rendered two
   * <button key={o.id}> siblings with the same key, which it warns about and
   * which can duplicate or drop entries.
   */
  const dedupeNew = useCallback((prev: ServerEntry[], incoming: ServerEntry[]): ServerEntry[] => {
    const seen = new Set(prev.map(s => s.id));
    const out: ServerEntry[] = [];
    for (const s of incoming) {
      if (!s?.id || seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
    return out;
  }, []);

  const [serverList, setServerList] = useState<ServerEntry[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>(""); // server id

  // ── Anime Data ──
  const [episodeList, setEpisodeList] = useState<EpisodeItem[]>([]);
  const [animeTitle, setAnimeTitle] = useState("");
  const [animeImage, setAnimeImage] = useState("");
  const [animeDescription, setAnimeDescription] = useState("");
  const [animeStatus, setAnimeStatus] = useState("");
  const [animeType, setAnimeType] = useState("");
  const [animeSeason, setAnimeSeason] = useState("");
  const [animeEpisodes, setAnimeEpisodes] = useState<number | null>(null);
  const [animeDuration, setAnimeDuration] = useState<number | null>(null);
  const [animeStudios, setAnimeStudios] = useState<string[]>([]);
  const [animeGenres, setAnimeGenres] = useState<string[]>([]);
  const [animeScore, setAnimeScore] = useState<number | null>(null);
  const [animeNextAiring, setAnimeNextAiring] = useState<{ episode: number; airingAt: number } | null>(null);
  // Skip times — PERSISTENT across provider switches.
  // PRIMARY: AniSkip (community DB — most reliable, well-tested)
  // BACKUP: AniKage (works for ALL anime including new ones, but times
  //         are sometimes misaligned with non-AniKage streams)
  // The instant-servers API returns AniKage intro/outro on every server
  // entry, but we ALSO fetch from AniSkip separately and PREFER it because
  // AniKage times are sometimes off (wrong episode cut, recap offset, etc).
  const [aniskipData, setAniskipData] = useState<{ intro: { start: number; end: number } | null; outro: { start: number; end: number } | null }>({ intro: null, outro: null });
  // AniKage skip times stored separately so we can prefer AniSkip when both exist.
  const [anikageData, setAnikageData] = useState<{ intro: { start: number; end: number } | null; outro: { start: number; end: number } | null }>({ intro: null, outro: null });
  // Effective skip times: AniSkip wins, AniKage fallback.
  // Both are validated again here as defense-in-depth — even if a provider
  // slips {start: 0, end: 0} through, the validator catches it before
  // it reaches the player. This prevents the "outro button shows at anime
  // start" bug where bad outro data (start=0) made the button appear
  // immediately when the video loaded.
  const effectiveSkip = useMemo(() => ({
    intro: validateSkipTime(aniskipData.intro || anikageData.intro || null, "intro"),
    outro: validateSkipTime(aniskipData.outro || anikageData.outro || null, "outro"),
  }), [aniskipData, anikageData]);

  // ── Providers Map ──
  const [providersMap, setProvidersMap] = useState<Record<string, ProviderEpisodes>>({});

  // ── UI State ──
  const [activeTab, setActiveTab] = useState<ContentTab>("info");
  const [epSortOrder, setEpSortOrder] = useState<EpisodeSortOrder>("asc");
  const [epSearch, setEpSearch] = useState("");
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const autoNext = prefs.autoNext;
  const setAutoNext = (v: boolean) => setPref("autoNext", v);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [jumpToEp, setJumpToEp] = useState("");
  const [countdown, setCountdown] = useState("");

  // ── Player Control Bar State (CinemaOS-style) ──
  const autoPlay = prefs.autoplay;
  const setAutoPlay = (v: boolean) => setPref("autoplay", v);
  const autoSkip = prefs.autoSkip;
  const setAutoSkip = (v: boolean) => setPref("autoSkip", v);
  const skipFiller = prefs.skipFillers;
  const setSkipFiller = (v: boolean) => setPref("skipFillers", v);
  const [flipLayout, setFlipLayout] = useState(false);
  const [lightsOff, setLightsOff] = useState(false);

  // ── Relations & Recommendations ──
  const [relations, setRelations] = useState<RelationAnime[]>([]);
  const [recommendations, setRecommendations] = useState<RelationAnime[]>([]);
  const [animeTitleRomaji, setAnimeTitleRomaji] = useState("");

  // ── Callbacks (declared BEFORE effects that reference them) ──

  const switchEpisode = useCallback((epNum: number) => {
    navigate({ page: "watch", id: animeId, episode: epNum, title: animeTitle, image: animeImage });
  }, [navigate, animeId, animeTitle, animeImage]);

  // ── Scraper fallback state (now used as a simple retry token) ──
  const [scraperFallbackToken, setScraperFallbackToken] = useState(0);
  const [scraperSitesTried, setScraperSitesTried] = useState<string[]>([]);

  const handleProviderFailed = useCallback((_provider: string) => {
    // Simple retry — re-fetch from Miruro direct
    // (miruro-direct tries all 12 providers internally, so a retry may pick a different one)
    setStreamError("Stream failed. Retrying...");
    setStreamLoading(true);
    setScraperFallbackToken(t => t + 1);
  }, []);

  // ── Scraper retry effect: fires when handleProviderFailed triggers ──
  useEffect(() => {
    if (!scraperFallbackToken || !anilistId) return;
    let cancelled = false;

    async function retryStream() {
      try {
        // Map 3-way translation mode to the 2-way type the miruro-direct API expects
        const apiType = translation === "dub" ? "dub" : "sub";
        const res = await fetch(
          `/api/anime/scraper/miruro-direct/${anilistId}/${episodeNum}?type=${apiType}`
        );
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            const streamData: StreamData = {
              video_link: data.url,
              source_type: data.sourceType === "mp4" ? "mp4" : "hls",
              hls_sources: [{
                url: data.url,
                quality: data.quality || "Auto",
                label: `Miruro ${data.provider} ${data.quality || ""}`.trim(),
                isM3U8: data.isM3U8 ?? true,
              }],
              embed_sources: [],
              subtitle_tracks: (data.subtitles || []).map((s: any) => ({
                url: s.url,
                label: s.language || s.lang || "English",
                kind: "subtitles" as const,
              })),
              intro: data.intro || null,
              outro: data.outro || null,
              provider: data.provider,
              available_qualities: [data.quality || "Auto"],
              tried_providers: data.triedProviders,
              all_providers: data.triedProviders,
            };
            setStreamData(streamData);
            setStreamLoading(false);
            setStreamError(null);
            return;
          }
        }
        if (!cancelled) {
          setStreamError("No stream available from Miruro. Try another episode.");
          setStreamLoading(false);
        }
      } catch {
        if (!cancelled) {
          setStreamError("Failed to load stream. Try refreshing the page.");
          setStreamLoading(false);
        }
      }
    }

    retryStream();
    return () => { cancelled = true; };
  }, [scraperFallbackToken, anilistId, episodeNum, translation]);

  const handleProviderSelect = useCallback((provider: string) => {
    if (provider === activeProvider) return;
    setActiveProvider(provider);
    setFailedProviders(new Set());
    setStreamError(null);
  }, [activeProvider]);

  const handleTranslationChange = useCallback((t: "sub" | "hardsub" | "dub" | "hindi") => {
    if (t === translation) return;
    setTranslation(t);
    setFailedProviders(new Set());
    setStreamError(null);

    // Auto-select the best server for the new translation mode.
    // This way the user doesn't have to manually pick a server when switching.
    setSelectedServer(prev => {
      if (!serverList || serverList.length === 0) return prev;

      let best: ServerEntry | undefined;

      if (t === "hindi") {
        // Hindi: prefer AnixTV hindi_1, then animostream (also Hindi dub),
        // then any anixtv server (TryEmbed etc. with hindi dub via audio track)
        best = serverList.find(s => s.source === "anixtv" && s.provider === "hindi_1")
            || serverList.find(s => s.source === "animostream")
            || serverList.find(s => s.source === "anixtv");
      } else if (t === "dub") {
        // Dub: find dub server (not anixtv hindi_1, not animostream which is Hindi-only)
        best = serverList.find(s => s.type === "dub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld")
            || serverList.find(s => s.type === "dub");
      } else if (t === "hardsub") {
        // Hardsub: prefer 4animo, then true hardsub servers
        best = serverList.find(s => s.source === "animo4" && s.type === "sub")
            || serverList.find(s => s.type === "sub" && s.hardsub === true)
            || serverList.find(s => s.type === "sub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld")
            || serverList.find(s => s.type === "sub");
      } else {
        // Sub (default): find softsub server, prefer mimi.
        // Exclude AnixTV + AnimoStream (Hindi-only sources).
        best = serverList.find(s => s.id === "animex:mimi:sub")
            || serverList.find(s => s.type === "sub" && s.hardsub !== true && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld")
            || serverList.find(s => s.type === "sub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld")
            || serverList.find(s => s.type === "sub");
      }

      if (best) {
        setStreamError(null);
        return best.id;
      }
      // No server found for this mode
      if (t === "hindi") {
        setStreamError("We don't have Hindi dub for this anime. Try Sub or Dub instead.");
      } else {
        setStreamError(`No ${t} servers available for this episode. Try another mode.`);
      }
      return prev;
    });
  }, [translation, serverList]);

  const handleVideoEnded = useCallback(() => {
    if (autoNext) {
      const nextEpNum = episodeNum + 1;
      if (episodeList.some(ep => ep.number === nextEpNum)) {
        switchEpisode(nextEpNum);
      }
    }
  }, [autoNext, episodeNum, episodeList, switchEpisode]);



  // ── Load anime info ──
  useEffect(() => {
    let cancelled = false;
    async function loadInfo() {
      try {
        const res = await fetch(`/api/anime/info?id=${encodeURIComponent(animeId)}`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          const info = data.anilistInfo;

          if (info) {
            setAnimeTitle(
              info.title?.english || info.title?.romaji || ""
            );
            if (info.title?.romaji && info.title.romaji !== (info.title.english || "")) {
              setAnimeTitleRomaji(info.title.romaji);
            }
            setAnimeImage(
              info.coverImage?.extraLarge || info.coverImage?.large || ""
            );
            setAnimeDescription(
              info.description?.replace(/<[^>]*>/g, "") || ""
            );
            if (info.id && !anilistId) setAnilistId(info.id);
            if (info.status) setAnimeStatus(info.status);
            if (info.format) setAnimeType(info.format);
            if (info.season && info.seasonYear) setAnimeSeason(`${info.season} ${info.seasonYear}`);
            if (info.episodes) setAnimeEpisodes(info.episodes);
            if (info.duration) setAnimeDuration(info.duration);
            if (info.averageScore) setAnimeScore(info.averageScore);
            if (info.genres) setAnimeGenres(info.genres);
            if (info.studios?.nodes) {
              setAnimeStudios(
                info.studios.nodes
                  .filter((s: any) => s.isAnimationStudio)
                  .map((s: any) => s.name)
              );
            } else if (Array.isArray(info.studios) && info.studios[0]?.name) {
              setAnimeStudios(
                info.studios
                  .filter((s: any) => s.isAnimationStudio)
                  .map((s: any) => s.name)
              );
            }
            if (info.nextAiringEpisode) setAnimeNextAiring(info.nextAiringEpisode);
            if (data.nextAiringEpisode) setAnimeNextAiring(data.nextAiringEpisode);

            // Relations
            if (info.relations) {
              const relsRaw = Array.isArray(info.relations) && info.relations[0]?.relationType
                ? info.relations
                : (info.relations?.edges || []);
              if (relsRaw.length > 0) {
                setRelations(relsRaw.map((edge: any) => {
                  const node = edge.node || edge;
                  return {
                    relationType: edge.relationType,
                    id: node.id,
                    title: node.title,
                    coverImage: node.coverImage,
                    type: node.type,
                    format: node.format,
                    episodes: node.episodes,
                    status: node.status,
                  };
                }));
              }
            }

            // Recommendations (both AniList edge shape and pre-flattened shape)
            const recsRaw = Array.isArray(info.recommendations)
              ? info.recommendations
              : (info.recommendations?.nodes || []);
            if (recsRaw.length > 0) {
              setRecommendations(
                recsRaw
                  .map((r: any) => r.mediaRecommendation || r)
                  .filter((m: any) => m && m.id)
                  .map((m: any) => ({
                    id: m.id,
                    title: m.title,
                    coverImage: m.coverImage,
                    type: m.type,
                    format: m.format,
                    episodes: m.episodes,
                    status: m.status,
                    averageScore: m.averageScore,
                  }))
              );
            }
          }
        }
      } catch { /* ignore */ }
    }
    loadInfo();
    return () => { cancelled = true; };
  }, [animeId, anilistId]);

  // ── Load episodes ──
  // PRIMARY: AniList (always works, has episode count + streamingEpisodes with thumbnails)
  // THUMBNAIL FALLBACK: Lunar scraper (real per-episode scene stills on fetch.flixcloud.cc)
  // TITLE FALLBACK: Animex scraper (real episode titles)
  // PROVIDER IDS: Miruro direct (for streaming provider IDs only)
  // The /api/anime/episodes endpoint is NOT used — it returns broken AllAnime thumbnails
  useEffect(() => {
    if (!anilistId) return;
    let cancelled = false;
    let episodesLoaded = false;

    async function loadEpisodes() {
      try {
        // ── STEP 1: AniList ONLY (FAST — shows episodes immediately) ──
        // AniList gives episode COUNT via Media.episodes (finished) or
        //   nextAiringEpisode.episode-1 (ongoing — how many have shipped)
        // We fetch Lunar + Animex enrichment data in the BACKGROUND (Step 2)
        // so episodes show instantly without waiting for 3 API calls.
        const alRes = await Promise.race([
          fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: `query($id: Int){ Media(id: $id, type: ANIME){ episodes format nextAiringEpisode { episode airingAt } streamingEpisodes { title thumbnail url site } airingSchedule(perPage: 1000){ nodes { episode airingAt } } } }`,
              variables: { id: anilistId },
            }),
          }),
          new Promise<Response | null>(resolve => setTimeout(() => resolve(null), 5000)),
        ]);
        if (cancelled) return;

        // Parse episode-info response (empty for now — will be filled in background)
        const epInfoMap: Record<number, { title?: string; description?: string; airDate?: string; thumbnail?: string }> = {};

        // Parse AniList response
        let totalEps = 0;
        let alEps: any[] = [];
        let isMovie = false;
        const dateMap = new Map<number, string>(); // episode number → formatted date
        if (alRes?.ok) {
          try {
            const alData = await alRes.json();
            const media = alData?.data?.Media;
            isMovie = media?.format === "MOVIE";
            if (media?.episodes && media.episodes > 0) {
              totalEps = media.episodes;
            } else if (media?.nextAiringEpisode && media.nextAiringEpisode.episode > 1) {
              totalEps = media.nextAiringEpisode.episode - 1;
            }
            // For movies, streamingEpisodes is often WRONG (returns TV episode data)
            if (!isMovie && media?.streamingEpisodes) {
              alEps = media.streamingEpisodes;
              if (!totalEps && alEps.length > 0) {
                totalEps = alEps.length;
              }
            }
            // Parse airingSchedule for episode air dates
            const schedNodes = media?.airingSchedule?.nodes || [];
            for (const node of schedNodes) {
              if (node.episode && node.airingAt) {
                const d = new Date(node.airingAt * 1000);
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                dateMap.set(node.episode, `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`);
              }
            }
          } catch { /* parse error */ }
        }

        // ── Lunar + Animex enrichment happens in BACKGROUND (Step 2) ──
        // For now, use empty maps — episodes show instantly from AniList data.
        // Lunar thumbnails + Animex titles will be merged in later.
        const lunarByNum = new Map<number, any>();
        const animexByNum = new Map<number, any>();

        // Fetch Lunar + Animex in background (don't block episode display)
        (async () => {
          try {
            const [lunarRes, animexRes] = await Promise.allSettled([
              fetch(`/api/anime/scraper/episodes/lunar/${anilistId}`).then(r => r.ok ? r.json() : null),
              fetch(`/api/anime/scraper/episodes/animex/${anilistId}`).then(r => r.ok ? r.json() : null),
            ]);
            if (cancelled) return;

            const lunarEps = lunarRes.status === 'fulfilled' && lunarRes.value?.episodes ? lunarRes.value.episodes : [];
            const animexEps = animexRes.status === 'fulfilled' && animexRes.value?.episodes ? animexRes.value.episodes : [];

            if (lunarEps.length === 0 && animexEps.length === 0) return;

            // Merge enrichment data into existing episode list
            setEpisodeList(prev => {
              if (prev.length === 0) return prev;
              const updated = [...prev];
              for (const ep of lunarEps) {
                const num = Number(ep.number);
                const idx = updated.findIndex(e => e.number === num);
                if (idx >= 0 && ep.thumbnail && !updated[idx].thumbnail) {
                  updated[idx] = { ...updated[idx], thumbnail: ep.thumbnail };
                }
              }
              for (const ep of animexEps) {
                const num = Number(ep.number);
                const idx = updated.findIndex(e => e.number === num);
                if (idx >= 0 && ep.title && updated[idx].title === `Episode ${num}`) {
                  updated[idx] = { ...updated[idx], title: ep.title };
                }
              }
              return updated;
            });
          } catch { /* background enrichment failed — episodes still work */ }
        })();

        if (alEps.length > 0 || totalEps > 0) {
          const maxFromScrapers = 0; // scrapers loaded in background
          // For movies, ALWAYS trust AniList's episode count (scrapers return wrong data)
          // For TV series: if AniList Media.episodes is set, it's AUTHORITATIVE.
          // Don't use streamingEpisodes.length — it can return wrong data
          // (e.g. Ramparts of Ice has 14 eps but streamingEpisodes returns 24)
          const finalTotal = isMovie && totalEps > 0
            ? totalEps
            : (totalEps > 0 ? totalEps : Math.max(maxFromScrapers || 0, alEps.length || 0));

          const all = new Map<number, EpisodeItem>();

          // 1) AniList streamingEpisodes (newest-first → reverse to ep 1 first)
          const alEpsReversed = [...alEps].reverse();
          alEpsReversed.forEach((ep: any, i: number) => {
            const num = i + 1;
            const info = epInfoMap[num];
            all.set(num, {
              number: num,
              title: info?.title || ep.title || `Episode ${num}`,
              filler: false,
              id: String(num),
              thumbnail: ep.thumbnail || info?.thumbnail || null,
              description: info?.description || undefined,
              airDate: info?.airDate || dateMap.get(num) || undefined,
            });
          });

          // 2) Fill remaining episodes using Lunar thumbnails + Animex titles
          if (finalTotal > 0) {
            for (let i = 1; i <= finalTotal; i++) {
              if (!all.has(i)) {
                const lunarEp = lunarByNum.get(i);
                const animexEp = animexByNum.get(i);
                const title = animexEp?.title || lunarEp?.title || `Episode ${i}`;
                // Lunar thumbnails on fetch.flixcloud.cc work directly in browsers
                // (Cloudflare only blocks data center IPs, not residential browsers).
                // Do NOT proxy through /api/image-proxy — Vercel's IP gets 403.
                const thumb = lunarEp?.thumbnail || null;
                all.set(i, {
                  number: i,
                  title,
                  filler: false,
                  id: String(i),
                  thumbnail: thumb,
                  description: epInfoMap[i]?.description || undefined,
                  airDate: epInfoMap[i]?.airDate || dateMap.get(i) || undefined,
                });
              }
            }
          }

          // 3) For episodes that came from AniList streamingEpisodes but Animex has a better title, merge it
          setEpisodeList(prev => {
            const merged = Array.from(all.values()).map(ep => {
              const animexEp = animexByNum.get(ep.number);
              // Only override title if AniList title is generic ("Episode N") and Animex has real one
              if (animexEp?.title && animexEp.title !== `Episode ${ep.number}` &&
                  (!ep.title || ep.title === `Episode ${ep.number}`)) {
                return { ...ep, title: animexEp.title };
              }
              return ep;
            }).sort((a, b) => a.number - b.number);
            return merged;
          });

          if (!cancelled && all.size > 0) {
            episodesLoaded = true;
          }
        }
      } catch { /* AniList failed */ }

      // ── STEP 1.5: Fetch episode descriptions from api.ani.zip (TVDB) ──
      // api.ani.zip has episode-specific descriptions, titles, and thumbnails
      // from TVDB — much richer than AniList's streamingEpisodes.
      // Also used to filter out UNRELEASED episodes (airDate in the future).
      if (!cancelled && episodesLoaded) {
        fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (cancelled || !data?.episodes) return;
            const now = Date.now();
            setEpisodeList(prev => {
              const updated = prev.map(ep => {
                const info = data.episodes[String(ep.number)] || data.episodes[ep.number];
                if (!info) return ep;
                return {
                  ...ep,
                  description: info.overview || ep.description,
                  airDate: info.airDate || info.airdate || ep.airDate,
                  title: info.title?.en || info.title?.["x-jat"] || ep.title,
                  thumbnail: info.image || ep.thumbnail,
                };
              });
              // Filter out unreleased episodes (airDate in the future)
              return updated.filter(ep => {
                if (!ep.airDate) return true; // keep if no air date
                const airTime = new Date(ep.airDate).getTime();
                if (isNaN(airTime)) return true; // keep if can't parse
                return airTime <= now; // keep only if already aired
              });
            });
          })
          .catch(() => {});
      }

      // ── STEP 2: Miruro direct — for streaming provider IDs only ──
      try {
        const miruroRes = await fetch(`/api/anime/miruro-direct/episodes/${anilistId}`);
        if (cancelled) return;
        if (miruroRes.ok) {
          const data = await miruroRes.json();
          const subEps = data.sub || [];
          const dubEps = data.dub || [];

          // If episodes never loaded, use miruro as fallback
          if (!episodesLoaded && subEps.length > 0) {
            const all = new Map<number, EpisodeItem>();
            for (const ep of subEps) {
              all.set(Number(ep.number), {
                number: Number(ep.number),
                title: ep.title || `Episode ${ep.number}`,
                filler: !!ep.isFiller || !!ep.filler,
                id: ep.id || ep.slug || String(ep.number),
                thumbnail: ep.thumbnail || ep.image || null,
              });
            }
            for (const ep of dubEps) {
              const num = Number(ep.number);
              if (!all.has(num)) {
                all.set(num, {
                  number: num,
                  title: ep.title || `Episode ${ep.number}`,
                  filler: !!ep.isFiller || !!ep.filler,
                  id: ep.id || ep.slug || String(ep.number),
                  thumbnail: ep.thumbnail || ep.image || null,
                });
              }
            }
            const episodes = Array.from(all.values()).sort((a, b) => a.number - b.number);
            if (episodes.length > 0 && !cancelled) {
              setEpisodeList(episodes);
              episodesLoaded = true;
            }
          }

          // Always merge miruro provider IDs for streaming
          if (episodesLoaded) {
            setEpisodeList(prev => prev.map(ep => {
              const miruroEp = subEps.find((m: any) => Number(m.number) === ep.number);
              if (miruroEp && (ep.id === String(ep.number) || !ep.id.includes(':'))) {
                return { ...ep, id: miruroEp.id || miruroEp.slug || ep.id };
              }
              return ep;
            }));
          }

          if (data.providers?.length) {
            setAvailableProviders(data.providers);
          }
          if (data.defaultProvider) {
            setActiveProvider(data.defaultProvider);
          }
          setDubAvailable(dubEps.length > 0);
        }
      } catch { /* miruro failed */ }
    }
    loadEpisodes();
    return () => { cancelled = true; };
  }, [anilistId]);

  // Reset loading screen when anime changes (different anilistId = new anime)
  // so the cinematic loading shows once per anime, not per episode
  useEffect(() => {
    setHasShownLoadingScreen(false);
  }, [anilistId]);

  // ── Fetch AniKoto + AniNeko.to servers when the anime title is available ──
  // These providers need the title to search for the anime on their site.
  // They have their own dedicated endpoints (separate from instant-servers)
  // so they don't block or get blocked by other providers.
  // Called in parallel when animeTitle changes from "" to the real title.
  useEffect(() => {
    if (!anilistId || !animeTitle) return;
    let cancelled = false;

    // Fetch AniKoto servers (direct m3u8 + subtitles + skip times)
    fetch(`/api/anime/anichi-servers/${anilistId}/${episodeNum}?title=${encodeURIComponent(animeTitle)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.servers?.length) return;
        setServerList(prev => {
          const newServers = dedupeNew(prev, data.servers);
          if (newServers.length === 0) return prev;
          console.log(`[WatchPage] AniKoto: added ${newServers.length} servers`);
          return [...prev, ...newServers];
        });
      })
      .catch(() => { /* best-effort */ });

    // Fetch AniNeko.to servers (direct m3u8 + soft sub subtitles)
    fetch(`/api/anime/anineko-to-servers/${anilistId}/${episodeNum}?title=${encodeURIComponent(animeTitle)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.servers?.length) return;
        setServerList(prev => {
          const newServers = dedupeNew(prev, data.servers);
          if (newServers.length === 0) return prev;
          console.log(`[WatchPage] AniNeko.to: added ${newServers.length} servers`);
          return [...prev, ...newServers];
        });
        // Auto-select AniNeko as PRIMARY default (overrides non-anineko selections)
        setSelectedServer(prev => {
          // If anineko/anichi is already selected, keep it
          if (prev && (prev.includes("anineko") || prev.includes("anichi"))) return prev;
          const subServer = data.servers.find((s: ServerEntry) => s.type === "sub" && !s.isEmbed);
          if (subServer) {
            setStreamLoading(false);
            console.log(`[WatchPage] AniNeko auto-selected (PRIMARY): ${subServer.id}`);
            return subServer.id;
          }
          return prev;
        });
      })
      .catch(() => { /* best-effort */ });

    return () => { cancelled = true; };
  }, [anilistId, episodeNum, animeTitle]);

  // ── AnixTV Hindi dub (standalone, fast) ──
  // Deliberately NOT waiting on animeTitle: the endpoint resolves the title
  // itself, and Hindi used to be the one mode that never arrived because it was
  // stuck behind the 17-provider /api/anime/servers fan-out.
  useEffect(() => {
    if (!anilistId) return;
    let cancelled = false;

    fetch(`/api/anime/anixtv-servers/${anilistId}/${episodeNum}${animeTitle ? `?title=${encodeURIComponent(animeTitle)}` : ""}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.servers?.length) return;
        setServerList(prev => {
          const newServers = dedupeNew(prev, data.servers);
          if (newServers.length === 0) return prev;
          console.log(`[WatchPage] AnixTV Hindi: added ${newServers.length} server(s), season ${data.season}`);
          setHindiAvailable(true);
          return [...prev, ...newServers];
        });
      })
      .catch(() => { /* best-effort */ });

    // AnimoStream Hindi dub — the fallback when AnixTV has nothing. Only
    // carries ~250 titles, so an empty result is normal, not an error.
    fetch(`/api/anime/animostream-hindi/${anilistId}/${episodeNum}${animeTitle ? `?title=${encodeURIComponent(animeTitle)}` : ""}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.servers?.length) return;
        setServerList(prev => {
          const newServers = dedupeNew(prev, data.servers);
          if (newServers.length === 0) return prev;
          console.log(`[WatchPage] AnimoStream Hindi: added ${newServers.length} server(s) (matched "${data.matchedTitle}")`);
          setHindiAvailable(true);
          return [...prev, ...newServers];
        });
      })
      .catch(() => { /* best-effort */ });

    // WatchAnimeWorld.top Hindi dub — multi-audio Indian dub site.
    // Resolves m3u8 via Zephyrix Fire HLS Player API or offers embed fallback.
    fetch(`/api/anime/watchanimeworld-servers/${anilistId}/${episodeNum}${animeTitle ? `?title=${encodeURIComponent(animeTitle)}` : ""}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.servers?.length) return;
        setServerList(prev => {
          const newServers = dedupeNew(prev, data.servers);
          if (newServers.length === 0) return prev;
          console.log(`[WatchPage] WatchAnimeWorld Hindi: added ${newServers.length} server(s) (matched "${data.matchedTitle}")`);
          setHindiAvailable(true);
          return [...prev, ...newServers];
        });
      })
      .catch(() => { /* best-effort */ });

    return () => { cancelled = true; };
  }, [anilistId, episodeNum, animeTitle]);

  // NOTE: The old fetchStream effect that called /api/anime/scraper/miruro-direct
  // has been REMOVED. Stream loading is now handled by the server selector
  // effect below (line ~575) which uses the verified streamUrl from /api/anime/servers.
  // The old effect was competing with the new one and overriding the stream data.

  // ── Fetch VERIFIED server list (all streams checked in parallel) ──
  // Takes ~4s but every server shown WILL play. No dead servers.
  // Each server includes a ready-to-play streamUrl — switching is instant.
  useEffect(() => {
    if (!anilistId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset of server state before re-fetching
    setServerList([]);
    setSelectedServer("");
    setStreamLoading(true);
    setStreamError(null);
    setStreamData(null);
    // Only show loading screen on FIRST visit (not episode changes)
    // The loading screen is a one-time cinematic intro per anime
    if (!hasShownLoadingScreen) {
      setPlayerReady(false);
      setHasShownLoadingScreen(true);
    }

    // Safety timeout: if no servers arrive within 30s, show error.
    // Fast providers (mimi, AniDB, Kyren) arrive in 1-3s.
    // Slow providers (AniDap, AniPm, Luna) arrive in 5-10s.
    // 30s is generous — if nothing arrives by then, something is broken.
    const safetyTimeout = setTimeout(() => {
      if (cancelled) return;
      setServerList(prev => {
        if (prev.length > 0) {
          setStreamLoading(false);
          return prev;
        }
        setStreamLoading(false);
        setStreamError("Servers are taking too long to load. Try refreshing the page.");
        return [];
      });
    }, 30000);

    // ── Fetch INSTANT servers FIRST (AniDB, AniKoto, AniNeko) ──
    // These are reliable providers that don't dead-link. They resolve
    // in ~2-3 seconds and are auto-selected as the default.
    // AniDB is priority 0 — always the first server shown.
    const animeTitleForInstant = animeTitle || animeTitleRomaji || "";
    fetch(`/api/anime/instant-servers/${anilistId}/${episodeNum}${animeTitleForInstant ? `?title=${encodeURIComponent(animeTitleForInstant)}` : ""}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.servers?.length) return;
        setServerList(prev => {
          const newServers = dedupeNew(prev, data.servers);
          return [...prev, ...newServers];
        });
        // Auto-select the best server instantly.
        // PRIORITY: AniNeko/AniChi > other non-embed sub > first available.
        // AniNeko has the most reliable streams with soft subs, so we prefer it.
        // Only auto-selects if no server is selected yet.
        setSelectedServer(prev => {
          if (prev) return prev; // don't override if already selected
          if (data.servers.length > 0) {
            setStreamLoading(false);
            // 1. Prefer AniNeko/AniChi non-embed sub (most reliable)
            const anineko = data.servers.find((s: ServerEntry) =>
              (s.source === "anineko" || s.source === "anineko-to" || s.source === "anichi" || s.id?.includes("anineko") || s.id?.includes("anichi")) &&
              s.type === "sub" && !s.isEmbed
            );
            // 2. Fallback: any non-embed sub server
            const firstSub = data.servers.find((s: ServerEntry) => s.type === "sub" && !s.isEmbed);
            const pick = anineko || firstSub || data.servers[0];
            console.log(`[WatchPage] Instant-auto-selected: ${pick.id} (from ${data.servers.length} servers)`);
            return pick.id;
          }
          return prev;
        });
      })
      .catch(() => { /* instant servers are best-effort */ });

    // ── Fetch MIRURO V3 servers (api.luffytv.online) ──
    // These are on a SEPARATE route from instant-servers.
    // They merge in alongside the other providers.
    fetch(`/api/anime/miruro-v3/servers/${anilistId}/${episodeNum}?sub=1&dub=1`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.servers?.length) return;
        setServerList(prev => {
          const newServers = dedupeNew(prev, data.servers);
          if (newServers.length === 0) return prev;
          console.log(`[WatchPage] Miruro V3: added ${newServers.length} servers`);
          const combined = [...prev, ...newServers];
          setDubAvailable(combined.some((s: ServerEntry) => s.type === "dub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld"));
          setSoftsubAvailable(combined.some((s: ServerEntry) => s.type === "sub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld"));
          return combined;
        });
      })
      .catch(() => { /* miruro v3 is best-effort */ });

    // The slow half (animex, anivault, animepahe, animeonsen, reanime,
    // 4animo, anibd) runs as its own request so it gets a full serverless
    // budget instead of being cut short to fit alongside the fast providers.
    // It simply merges in whenever it lands — nothing is dropped for being slow.
    fetch(`/api/anime/servers/${anilistId}/${episodeNum}?group=slow`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.servers?.length) return;
        setServerList(prev => {
          const newServers = dedupeNew(prev, data.servers);
          if (newServers.length === 0) return prev;
          console.log(`[WatchPage] Slow providers: added ${newServers.length} servers`);
          const combined = [...prev, ...newServers];
          setDubAvailable(combined.some((s: ServerEntry) => s.type === "dub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld"));
          setHardsubAvailable(combined.some((s: ServerEntry) => s.type === "sub" && (s.hardsub === true || s.source === "animo4")));
          setSoftsubAvailable(combined.some((s: ServerEntry) => s.type === "sub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld"));
          return combined;
        });
      })
      .catch(() => { /* best-effort — the fast half already populated the list */ });

    fetch(`/api/anime/servers/${anilistId}/${episodeNum}?group=fast`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return;
        if (!data?.servers?.length) {
          // Don't overwrite if animex servers already loaded (they arrive via separate fetch)
          setServerList(prev => {
            if (prev.length > 0) {
              setStreamLoading(false);
              return prev;
            }
            setStreamLoading(false);
            setStreamError("No servers available for this episode.");
            return [];
          });
          return;
        }
        // MERGE with existing servers (animex may have arrived first via separate fetch).
        // Don't overwrite — append new servers that don't already exist.
        setServerList(prev => {
          const newServers = dedupeNew(prev, data.servers);
          const combined = [...prev, ...newServers];
          // Update availability flags based on the combined list
          const hasDub = combined.some((s: ServerEntry) => s.type === "dub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld");
          const hasHardsub = combined.some((s: ServerEntry) => s.type === "sub" && (s.hardsub === true || s.source === "animo4"));
          const hasSoftsub = combined.some((s: ServerEntry) => s.type === "sub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld");
          const hasHindi = combined.some((s: ServerEntry) => s.source === "anixtv" || s.source === "animostream" || s.source === "watchanimeworld");
          setDubAvailable(hasDub);
          setHardsubAvailable(hasHardsub);
          setSoftsubAvailable(hasSoftsub);
          setHindiAvailable(hasHindi);
          return combined;
        });

        // Auto-select first server matching current translation mode.
        // DON'T override if a server is already selected (instant servers
        // like AniDB may have already been auto-selected).
        // Translation modes: "sub" (soft sub preferred, falls back to hardsub),
        // "hardsub", "dub" (English dub), "hindi" (Hindi dub from AnixTV).
        setSelectedServer(prevSelected => {
          if (prevSelected) return prevSelected; // don't override instant-server selection

          let firstMatch: ServerEntry | undefined;
          if (translation === "hindi") {
            // Prefer AnixTV Hindi 1, then AnimoStream, then any anixtv
            firstMatch = data.servers.find((s: ServerEntry) => s.source === "anixtv" && s.provider === "hindi_1")
              || data.servers.find((s: ServerEntry) => s.source === "animostream")
              || data.servers.find((s: ServerEntry) => s.source === "anixtv");
          } else if (translation === "dub") {
            firstMatch = data.servers.find((s: ServerEntry) => s.type === "dub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld");
          } else if (translation === "hardsub") {
            // Hardsub: prefer 4animo, then true hardsub servers
            firstMatch = data.servers.find((s: ServerEntry) => s.source === "animo4" && s.type === "sub")
              || data.servers.find((s: ServerEntry) => s.type === "sub" && s.hardsub === true);
          } else {
            // "sub" → soft sub preferred, fall back to any sub (hardsub ok)
            // Exclude AnixTV + AnimoStream (Hindi-only sources)
            firstMatch = data.servers.find((s: ServerEntry) => s.type === "sub" && s.hardsub !== true && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld")
                      || data.servers.find((s: ServerEntry) => s.type === "sub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld")
                      || data.servers.find((s: ServerEntry) => s.type === "sub");
          }

          // If first match doesn't exist (e.g. user picked "hardsub" but only
          // soft sub is available), fall back to whatever's first available
          // in priority order: soft sub → hard sub → dub
          if (!firstMatch) {
            firstMatch = data.servers.find((s: ServerEntry) => s.type === "sub" && s.hardsub !== true && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld")
                      || data.servers.find((s: ServerEntry) => s.type === "sub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld")
                      || data.servers.find((s: ServerEntry) => s.type === "sub")
                      || data.servers.find((s: ServerEntry) => s.type === "dub")
                      || data.servers[0];
            // Update translation to match what we actually picked
            if (firstMatch) {
              if (firstMatch.type === "dub") setTranslation("dub");
              else if (firstMatch.hardsub === true) setTranslation("hardsub");
              else setTranslation("sub");
            }
          }

          if (firstMatch) {
            return firstMatch.id;
          } else if (data.servers[0]) {
            return data.servers[0].id;
          }
          return prevSelected;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStreamLoading(false);
          setStreamError("Failed to load servers.");
        }
      });

    // ── Fetch Animex servers SEPARATELY (doesn't block the main list) ──
    // Animex fetches from pp.animex.one in batches — takes longer than other
    // sources. This runs in parallel and appends servers when ready.
    fetch(`/api/anime/animex-servers/${anilistId}/${episodeNum}`)
      .then(r => r.ok ? r.json() : null)
      .then(animexData => {
        if (cancelled || !animexData?.servers?.length) return;
        // Append Animex servers to the existing server list
        setServerList(prev => {
          // Avoid duplicates — only add servers whose IDs don't already exist
          const newServers = dedupeNew(prev, animexData.servers);
          const combined = [...prev, ...newServers];
          // Update availability flags
          const hasDub = combined.some((s: ServerEntry) => s.type === "dub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld");
          const hasHardsub = combined.some((s: ServerEntry) => s.type === "sub" && (s.hardsub === true || s.source === "animo4"));
          const hasSoftsub = combined.some((s: ServerEntry) => s.type === "sub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld");
          const hasHindi = combined.some((s: ServerEntry) => s.source === "anixtv" || s.source === "animostream" || s.source === "watchanimeworld");
          setDubAvailable(hasDub);
          setHardsubAvailable(hasHardsub);
          setSoftsubAvailable(hasSoftsub);
          setHindiAvailable(hasHindi);
          console.log(`[WatchPage] Animex servers loaded: +${newServers.length} (total: ${combined.length})`);
          return combined;
        });
      })
      .catch(() => {
        // Animex failed silently — other servers are still available
        console.log("[WatchPage] Animex servers failed to load (non-critical)");
      });

    // ── Fetch AniDap servers SEPARATELY (13+ providers, batched — slow) ──
    fetch(`/api/anime/anidap-servers/${anilistId}/${episodeNum}`)
      .then(r => r.ok ? r.json() : null)
      .then(anidapData => {
        if (cancelled || !anidapData?.servers?.length) return;
        setServerList(prev => {
          const newServers = dedupeNew(prev, anidapData.servers);
          const combined = [...prev, ...newServers];
          const hasDub = combined.some((s: ServerEntry) => s.type === "dub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld");
          const hasHardsub = combined.some((s: ServerEntry) => s.type === "sub" && (s.hardsub === true || s.source === "animo4"));
          const hasSoftsub = combined.some((s: ServerEntry) => s.type === "sub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld");
          setDubAvailable(hasDub);
          setHardsubAvailable(hasHardsub);
          setSoftsubAvailable(hasSoftsub);
          console.log(`[WatchPage] AniDap servers loaded: +${newServers.length} (total: ${combined.length})`);
          return combined;
        });
      })
      .catch(() => console.log("[WatchPage] AniDap servers failed to load (non-critical)"));

    // ── Fetch AniKuro servers SEPARATELY (11 providers via proxy.anikuro.ru) ──
    fetch(`/api/anime/anikuro-servers/${anilistId}/${episodeNum}`)
      .then(r => r.ok ? r.json() : null)
      .then(anikuroData => {
        if (cancelled || !anikuroData?.servers?.length) return;
        setServerList(prev => {
          const newServers = dedupeNew(prev, anikuroData.servers);
          const combined = [...prev, ...newServers];
          const hasDub = combined.some((s: ServerEntry) => s.type === "dub" && s.source !== "anixtv" && s.source !== "animostream" && s.source !== "watchanimeworld");
          setDubAvailable(hasDub);
          console.log(`[WatchPage] AniKuro servers loaded: +${newServers.length} (total: ${combined.length})`);
          return combined;
        });
      })
      .catch(() => console.log("[WatchPage] AniKuro servers failed to load (non-critical)"));

    // REMOVED: Animetsu and Miruro stream providers.
    // Miruro's episodes endpoint returns HTTP 403 so it produced no streams;
    // it is still used for anime metadata on the detail page, which is
    // untouched. Animex keeps its own dedicated fetch below.

    return () => { cancelled = true; clearTimeout(safetyTimeout); };
  }, [anilistId, episodeNum]);

  // ── Fetch skip times (PERSISTENT across provider switches) ──
  // PRIMARY: AniSkip (community DB — most reliable, well-tested)
  // BACKUP: AniKage (works for ALL anime including new ones, but times
  //         are sometimes misaligned with non-AniKage streams)
  //
  // Both sources are fetched in parallel and stored separately. The
  // effective skip time (aniskipData.intro || anikageData.intro) is
  // computed via `effectiveSkip` useMemo above. AniSkip WINS when both
  // are available — this fixes the "outro time is messed up" issue
  // where AniKage times were being applied to streams from other
  // providers (which may have different intro/outro positions).
  useEffect(() => {
    if (!anilistId || !episodeNum) return;
    let cancelled = false;
    setAniskipData({ intro: null, outro: null }); // reset on episode change
    setAnikageData({ intro: null, outro: null });

    // Fetch AniSkip (PRIMARY — covers old/popular anime, very reliable)
    // URL format: types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&types[]=recap
    // (the API expects types[] syntax — using `types=` without brackets
    // gets parsed as a single value by some backends and only `recap` survives)
    fetch(`https://api.aniskip.com/v2/skip-times/${anilistId}/${episodeNum}?types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&types[]=recap&episodeLength=0`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.found || !data?.results || !Array.isArray(data.results)) return;
        const intro = data.results.find((r: any) => r.skipType === "op" || r.skipType === "mixed-op");
        const outro = data.results.find((r: any) => r.skipType === "ed" || r.skipType === "mixed-ed");
        if (cancelled) return;
        setAniskipData({
          intro: intro ? { start: intro.interval.startTime, end: intro.interval.endTime } : null,
          outro: outro ? { start: outro.interval.startTime, end: outro.interval.endTime } : null,
        });
        console.log(`[WatchPage] AniSkip: intro=${intro ? `${intro.interval.startTime}-${intro.interval.endTime}` : "no"} outro=${outro ? `${outro.interval.startTime}-${outro.interval.endTime}` : "no"}`);
      })
      .catch(() => {});

    // Fetch AniKage skip times (BACKUP — works for ALL anime, applied to every instant server)
    fetch(`/api/anime/instant-servers/${anilistId}/${episodeNum}${animeTitle ? `?title=${encodeURIComponent(animeTitle)}` : ""}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.servers?.length) return;
        // Find the first server with intro/outro (these come from AniKage in
        // the instant-servers route — see lines 259-264 of that route).
        const serverWithSkip = data.servers.find((s: any) => s.intro || s.outro);
        if (serverWithSkip) {
          setAnikageData({
            intro: serverWithSkip.intro || null,
            outro: serverWithSkip.outro || null,
          });
          console.log(`[WatchPage] AniKage: intro=${serverWithSkip.intro ? `${serverWithSkip.intro.start}-${serverWithSkip.intro.end}` : "no"} outro=${serverWithSkip.outro ? `${serverWithSkip.outro.start}-${serverWithSkip.outro.end}` : "no"}`);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [anilistId, episodeNum, animeTitle]);

  // ── Play stream from selected server (INSTANT — no second API call) ──
  // The streamUrl is already verified and included in the server list.
  // Switching servers is instant — just set the stream data.
  useEffect(() => {
    if (!selectedServer) return;
    const server = serverList.find(s => s.id === selectedServer);
    if (!server) return;

    // The streamUrl is already in the server object — use it directly
    const streamUrl = (server as any).streamUrl;
    if (!streamUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional error state when selected server has no stream
      setStreamError(`${server.name} has no stream URL.`);
      setStreamLoading(false);
      return;
    }

    const quality = (server as any).quality || "Auto";
    const isM3U8 = (server as any).isM3U8 !== false;
    const isMP4 = (server as any).isMP4 === true;
    const isEmbed = (server as any).isEmbed === true;
    const isDASH = (server as any).isDASH === true;

    // For embed servers (AniNeko, AniKoto, etc.), the embed URL often includes
    // subtitle params (e.g. ?sub=, ?caption_1=, ?c1_file=) that tell the embed
    // player to render its OWN subtitles — which have ugly styling (big black
    // box, oversized text) that we can't override (cross-origin iframe).
    // Strip these params so the embed doesn't render subs. The subtitleTracks
    // are still passed below for our own HLS player overlay (non-embed servers).
    //
    // For embed servers (AnixTV, AniWaves, etc.): load the URL directly in an iframe.
    // Hindi embed servers (AnixTV, AnimoStream) use /api/embed/proxy which:
    //   1. Fetches the page server-side (bypasses CF bot protection via worker)
    //   2. Strips sandbox/iframe detection scripts
    //   3. Injects anti-sandbox overrides (window.self===window.top, etc.)
    //   4. Rewrites relative URLs and injects fill CSS
    //   5. Serves with X-Frame-Options: ALLOWALL
    // This is the same approach as the reference Vercel app (luffytv2) and is
    // far more robust than the raw CF Worker proxy which only sets headers.
    // Other embed servers use the CF Worker proxy directly (no anti-sandbox needed).
    // Servers that set `noProxy` are known-frameable hosts that ignore Referer —
    // sending those through the worker only adds a hop and a point of failure.
    const noProxy = (server as any).noProxy === true;
    const useEmbedProxy = (server as any).useEmbedProxy === true;
    const isHindiEmbedSource = (server as any).source === "anixtv" || (server as any).source === "animostream" || (server as any).source === "watchanimeworld";
    let finalStreamUrl = streamUrl;
    if (isEmbed) {
      try {
        const u = new URL(streamUrl);
        // Remove subtitle params so embed doesn't render its own ugly subs
        ["sub", "subtitle", "captions", "caption_1", "caption_2", "c1_file", "c2_file", "c1_label", "c2_label", "sub_1", "sub_2", "sub_label"].forEach(p => u.searchParams.delete(p));
        if (noProxy) {
          finalStreamUrl = u.toString();
        } else if (useEmbedProxy || isHindiEmbedSource) {
          // Route through /api/embed/proxy — our anti-sandbox embed proxy.
          // This fetches server-side, strips frame-busting, injects overrides,
          // and serves with ALLOWALL. For CF-protected sites like anixtv.in,
          // the proxy internally routes through the CF Worker to bypass bot protection.
          finalStreamUrl = `/api/embed/proxy?url=${encodeURIComponent(u.toString())}&ref=${encodeURIComponent(u.origin + "/")}`;
        } else {
          // Route through our Cloudflare Worker proxy — it sends the correct
          // Referer/Origin and serves the page with X-Frame-Options: ALLOWALL
          // so our iframe can load it.
          const WORKER_BASE = process.env.NEXT_PUBLIC_PROXY_BASE || "https://luffytv-proxy.ggy892767.workers.dev";
          finalStreamUrl = `${WORKER_BASE}/proxy?url=${encodeURIComponent(u.toString())}&ref=${encodeURIComponent(u.origin + "/")}`;
        }
      } catch { /* if URL parsing fails, use original */ }
    }

    // Skip times priority (PERSISTENT across provider switches):
    // 1. AniSkip (community DB, fetched separately — most reliable)
    // 2. AniKage (from instant-servers, baked into every server entry)
    // 3. Server's own intro/outro (same as #2 — already on every instant server)
    //
    // AniSkip WINS over AniKage because AniKage times are sometimes misaligned
    // with streams from other providers (different recaps, different cuts).
    // All values are validated — bad data (start=0, swapped intro/outro,
    // too-short intervals) is filtered out before reaching the player.
    const subtitleTracks = (server as ServerEntry).subtitleTracks || [];
    const serverIntro = validateSkipTime((server as ServerEntry).intro ?? null, "intro");
    const serverOutro = validateSkipTime((server as ServerEntry).outro ?? null, "outro");
    const intro = effectiveSkip.intro ?? serverIntro ?? null;
    const outro = effectiveSkip.outro ?? serverOutro ?? null;

    const newStreamData: StreamData = {
      video_link: finalStreamUrl,
      source_type: isEmbed ? "embed" : (isDASH ? "dash" : (isMP4 ? "mp4" : "hls")),
      hls_sources: [{
        url: finalStreamUrl,
        quality,
        label: `${server.name} ${quality}`.trim(),
        isM3U8,
      }],
      embed_sources: [],
      subtitle_tracks: subtitleTracks.map(t => ({
        url: t.url,
        label: t.label || t.lang || "English",
        kind: "subtitles" as const,
      })),
      intro,
      outro,
      provider: `${server.source}:${server.provider}`,
      available_qualities: [quality],
    };

    console.log(`[WatchPage] Playing via ${server.source}:${server.provider} (${quality}) — subs=${subtitleTracks.length} intro=${intro ? `${intro.start}-${intro.end}` : "no"} outro=${outro ? `${outro.start}-${outro.end}` : "no"}`);
    setStreamData(newStreamData);
    setStreamLoading(false);
    setStreamError(null);

    // ── Dismiss the full-page loading screen the MOMENT we have a stream URL.
    // Don't wait for the video's `onCanPlay` event — that can take 5-10s while
    // the HLS manifest downloads and the first segment buffers. The user wants
    // the loading screen gone the instant ANY server is ready, with the player
    // showing its own internal buffering spinner inside the video frame.
    // (The `onCanPlay` callback below is still wired up as a backup for any
    // edge case where this path didn't fire.)
    setPlayerReady(true);

    // ── Save to history (Continue Watching) ──
    // Adds this episode to the history store so it appears in the
    // "Continue Watching" section on the home page. Progress is 0 on
    // initial load — the progress update effect below keeps it in sync.
    if (animeTitle && animeId) {
      addToHistory({
        animeId,
        animeName: animeTitle,
        thumbnail: animeImage || undefined,
        episodeNum,
        progress: 0,
        duration: 0,
      });
    }
  }, [selectedServer, serverList, effectiveSkip]);

  // ── Track playback progress for Continue Watching ──
  // Listens to the video element's timeupdate event and saves progress
  // to the history store every 10 seconds (throttled to avoid spamming).
  useEffect(() => {
    if (!animeId || !episodeNum) return;
    let lastSave = 0;
    const handleTimeUpdate = () => {
      const video = document.querySelector("video");
      if (!video) return;
      const now = Date.now();
      // Throttle: save at most every 10 seconds
      if (now - lastSave < 10000) return;
      lastSave = now;
      const progress = video.duration > 0 ? (video.currentTime / video.duration) * 100 : 0;
      updateHistoryProgress(animeId, episodeNum, progress, video.duration || 0);
    };
    // Poll for the video element every 2 seconds (it may not exist yet
    // when this effect first runs — the player loads asynchronously)
    const pollInterval = setInterval(() => {
      const video = document.querySelector("video");
      if (video) {
        video.addEventListener("timeupdate", handleTimeUpdate);
        clearInterval(pollInterval);
      }
    }, 2000);
    return () => {
      clearInterval(pollInterval);
      const video = document.querySelector("video");
      if (video) video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [animeId, episodeNum, updateHistoryProgress]);

  // ── Next airing countdown ──
  useEffect(() => {
    if (!animeNextAiring) return;
    function update() {
      const now = Math.floor(Date.now() / 1000);
      const diff = (animeNextAiring as { episode: number; airingAt: number }).airingAt - now;
      if (diff <= 0) { setCountdown(""); return; }
      const d = Math.floor(diff / 86400);
      const h = Math.floor((diff % 86400) / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setCountdown(`${d}d ${h}h ${m}m ${s}s`);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [animeNextAiring]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
      if (e.key === "Escape") setShowShortcuts(false);

      if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
        const nextEpNum = episodeNum + 1;
        if (episodeList.some(ep => ep.number === nextEpNum)) {
          switchEpisode(nextEpNum);
        }
      }
      if (e.key === "p" && !e.ctrlKey && !e.metaKey) {
        if (episodeNum > 1) switchEpisode(episodeNum - 1);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [episodeNum, episodeList, switchEpisode]);

  // ── Computed ──
  const prevEp = episodeNum > 1 ? episodeNum - 1 : null;
  const nextEp = episodeList.some(e => e.number === episodeNum + 1) ? episodeNum + 1 : null;

  const searchLower = epSearch.toLowerCase();
  const filteredEps = episodeList
    .filter(ep => !epSearch || String(ep.number).includes(searchLower) || (ep.title || "").toLowerCase().includes(searchLower))
    .sort((a, b) => epSortOrder === "asc" ? a.number - b.number : b.number - a.number);

  const statusLabel = (s: string) => {
    if (s === "RELEASING") return "Airing";
    if (s === "FINISHED") return "Complete";
    if (s === "NOT_YET_RELEASED") return "Upcoming";
    return s;
  };

  const statusColor = (s: string) => {
    if (s === "RELEASING") return "text-[#10B981]";
    if (s === "FINISHED") return "text-[#6366F1]";
    if (s === "NOT_YET_RELEASED") return "text-[#F59E0B]";
    return "text-[#64748B]";
  };

  // ── Get providers that have current episode ──
  const providersForCurrentEp = availableProviders.filter(p => {
    const pData = providersMap[p];
    if (!pData?.episodes) return false;
    const eps = translation === "dub" ? pData.episodes.dub : pData.episodes.sub;
    return eps.some(e => e.number === episodeNum);
  });

  // ── Sub/Dub episode counts (for CC / mic chips like Miruro) ──
  const subCount = episodeList.length;
  const dubCount = Object.values(providersMap).reduce(
    (max, p) => Math.max(max, p?.episodes?.dub?.length || 0), 0
  );

  // ── RENDER — use new WatchPageShell ──
  return (
    <>
      {/* Full-page loading overlay removed — clicking an episode goes straight
          to the player, which shows its own in-frame buffering spinner while
          the stream resolves. No blocking intro screen. */}
      <WatchPageShell
      streamLoading={streamLoading}
      streamError={streamError}
      streamData={streamData}
      activeProvider={activeProvider}
      animeTitle={animeTitle}
      episodeNum={episodeNum}
      animeEpisodes={animeEpisodes}
      animeDuration={animeDuration}
      animeStatus={animeStatus}
      animeImage={animeImage}
      animeDescription={animeDescription}
      animeScore={animeScore}
      animeType={animeType}
      animeSeason={animeSeason}
      animeStudios={animeStudios}
      animeGenres={animeGenres}
      animeNextAiring={animeNextAiring}
      countdown={countdown}
      translation={translation}
      softsubAvailable={softsubAvailable}
      hardsubAvailable={hardsubAvailable}
      dubAvailable={dubAvailable}
      handleTranslationChange={handleTranslationChange}
      serverList={serverList}
      selectedServer={selectedServer}
      setSelectedServer={setSelectedServer}
      setStreamError={setStreamError}
      setStreamLoading={setStreamLoading}
      getProviderDisplayName={getProviderDisplayName}
      episodeList={episodeList}
      filteredEps={filteredEps}
      epSearch={epSearch}
      setEpSearch={setEpSearch}
      switchEpisode={switchEpisode}
      prevEp={prevEp}
      nextEp={nextEp}
      autoPlay={autoPlay}
      setAutoPlay={setAutoPlay}
      autoSkip={autoSkip}
      setAutoSkip={setAutoSkip}
      autoNext={autoNext}
      setAutoNext={setAutoNext}
      skipFiller={skipFiller}
      setSkipFiller={setSkipFiller}
      navigate={navigate}
      relations={relations}
      recommendations={recommendations}
      animeTitleRomaji={animeTitleRomaji}
      subCount={subCount}
      dubCount={dubCount}
      HLSPlayerNew={HLSPlayerNew}
      EmbedPlayerWithFallback={EmbedPlayerWithFallback}
      DashPlayer={DashPlayer}
      proxifyM3u8={proxifyM3u8}
      proxify={proxify}
      AnimeComments={AnimeComments}
      WatchPageExtras={WatchPageExtras}
      handleVideoEnded={handleVideoEnded}
      handleProviderFailed={handleProviderFailed}
      handleProviderSelect={handleProviderSelect}
      failedProviders={failedProviders}
      providersForCurrentEp={providersForCurrentEp}
      setScraperFallbackToken={setScraperFallbackToken}
      showShortcuts={showShortcuts}
      setShowShortcuts={setShowShortcuts}
      lightsOff={lightsOff}
      setLightsOff={setLightsOff}
      synopsisExpanded={synopsisExpanded}
      setSynopsisExpanded={setSynopsisExpanded}
      animeId={animeId}
      playerReady={playerReady}
      onCanPlay={() => setPlayerReady(true)}
      animeBackdrop={animeImage || undefined}
    />
    </>
  );
}
