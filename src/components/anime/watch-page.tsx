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
  /** Optional language hint from URL (/watch/{id}/{ep}/{lang}). When set,
   *  the watch page auto-selects a server of that language on load.
   *  e.g. "hindi" → picks AnimeSalt Hindi or other Hindi dub server. */
  language?: string;
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
  hardsub?: boolean; // true = subtitles are burned into the video (don't show external subs)
  // ── Client-side megaplay resolution ──
  megaplayFileId?: string;
  megaplayAudio?: 'sub' | 'dub';
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

export default function WatchPage({ animeId, episodeNum, language }: WatchPageProps) {
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

  // ── Fullscreen Retain ──
  // Track whether we were fullscreen BEFORE switching episodes,
  // so we can re-enter fullscreen after the new player mounts.
  const wasFullscreenRef = useRef(false);
  const fullscreenRetain = prefs.fullscreenRetain;
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
  // ── Initialize translation from the user's preferred language setting ──
  // If the user set "Dub" in Settings, default to dub on every watch page.
  // URL language hints override this (e.g. /watch/123/1/hindi → hindi).
  const [translation, setTranslation] = useState<"sub" | "hardsub" | "dub" | "hindi">(
    prefs.preferredLanguage === "dub" ? "dub" : "sub"
  );

  // ── URL language hint → auto-switch translation tab on mount ──
  // When user lands on /watch/{id}/{ep}/{lang}, set the translation tab to
  // match. This works WITH the auto-select logic in tryAutoSelect() —
  // together they ensure the player loads the correct language server
  // automatically.
  //   /watch/123/1/hindi → translation="hindi" → AnimeSalt Hindi auto-selected
  //   /watch/123/1/tamil → translation="hindi" (Tamil servers live under Hindi tab)
  //   /watch/123/1/telegu → translation="hindi"
  //   /watch/123/1/english → translation="sub"
  //   /watch/123/1/japanese → translation="sub"
  // Indian languages (hindi/tamil/telugu/...) all map to the "hindi" tab
  // because that's where AnimeSalt servers are categorized.
  useEffect(() => {
    if (!language) return;
    const lc = language.toLowerCase();
    const INDIAN_LANGS = new Set([
      "hindi", "tamil", "telugu", "malayalam", "bengali", "marathi", "kannada",
    ]);
    if (INDIAN_LANGS.has(lc)) {
      console.log(`[WatchPage] URL language=${lc} → translation="hindi"`);
      setTranslation("hindi");
    } else if (lc === "english" || lc === "japanese") {
      console.log(`[WatchPage] URL language=${lc} → translation="sub"`);
      setTranslation("sub");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);
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
    source: "animex" | "anivault" | "anivexa" | "senshi" | "anidap"  | "mioanime" | "animesalt" | "anistream" | "anikuro"  | "aniwaves" | "anidb" | "anikoto" | "anineko" | "anineko-to" | "anichi" | "allmanga" | "animo4" | "animostream" | "anibd" | "anidao" | "byse" | "watchanimeworld" | "uniquestream" | "blakite" | "desidub" | "miruro" | "animepahe" | "animeonsen" | "anikage" | "mkissa" | "anivexa" | "xanime" | "senshi", "senshi"; // removed: reanime, animeheaven (Shanks), reanimate, luna, anixtv (replaced by animesalt), anikoto-mirror (wrong anime match), anilight (user requested removal)
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
    /** Megaplay fileId for client-side resolution (bypasses VPS IP block) */
    megaplayFileId?: string;
    megaplayAudio?: 'sub' | 'dub';
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
    const seenIds = new Set(prev.map(s => s.id));
    const seenUrls = new Set(prev.map(s => s.streamUrl || ""));
    const out: ServerEntry[] = [];
    for (const s of incoming) {
      if (!s?.id || seenIds.has(s.id)) continue;
      // Also dedupe by streamUrl — prevents same m3u8 from appearing twice
      // under different server names (e.g., "Dao HD-1" from bibiemb + vivibebe)
      if (s.streamUrl && seenUrls.has(s.streamUrl)) continue;
      seenIds.add(s.id);
      if (s.streamUrl) seenUrls.add(s.streamUrl);
      out.push(s);
    }
    return out;
  }, []);

  const [serverList, setServerList] = useState<ServerEntry[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>(""); // server id
  const selectedServerRef = useRef(selectedServer);
  selectedServerRef.current = selectedServer;

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
  const [aniskipData, setAniskipData] = useState<{ intro: { start: number; end: number } | null; outro: { start: number; end: number } | null }>({ intro: null, outro: null });
  // Effective skip times: AniSkip.
  // Validated again here as defense-in-depth — even if a provider
  // slips {start: 0, end: 0} through, the validator catches it before
  // it reaches the player. This prevents the "outro button shows at anime
  // start" bug where bad outro data (start=0) made the button appear
  // immediately when the video loaded.
  const effectiveSkip = useMemo(() => ({
    intro: validateSkipTime(aniskipData.intro || null, "intro"),
    outro: validateSkipTime(aniskipData.outro || null, "outro"),
  }), [aniskipData]);

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
  const setFullscreenRetain = (v: boolean) => setPref("fullscreenRetain", v);
  const [flipLayout, setFlipLayout] = useState(false);
  const [lightsOff, setLightsOff] = useState(false);
  // Theater mode — separate from lightsOff. Theater mode just widens the
  // player (from 74% to ~90% width) and moves the sidebar below. NO dimming.
  // lightsOff is a separate toggle that dims the page around the player.
  const [theaterMode, setTheaterMode] = useState(false);

  // ── Relations & Recommendations ──
  const [relations, setRelations] = useState<RelationAnime[]>([]);
  const [recommendations, setRecommendations] = useState<RelationAnime[]>([]);
  const [animeTitleRomaji, setAnimeTitleRomaji] = useState("");

  // ── Callbacks (declared BEFORE effects that reference them) ──

  const switchEpisode = useCallback((epNum: number) => {
    // Capture fullscreen state BEFORE navigating (which unmounts the player)
    if (fullscreenRetain) {
      wasFullscreenRef.current = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
    }
    navigate({ page: "watch", id: animeId, episode: epNum, title: animeTitle, image: animeImage });
  }, [navigate, animeId, animeTitle, animeImage, fullscreenRetain]);

  // ── Scraper fallback state (now used as a simple retry token) ──
  const [scraperFallbackToken, setScraperFallbackToken] = useState(0);
  const [scraperSitesTried, setScraperSitesTried] = useState<string[]>([]);

  const handleProviderFailed = useCallback((_provider: string) => {
    // ── USER REQUEST: NO AUTO-FALLBACK ──
    // User said: "after few times it switch again dont this should not happen"
    // Previously this function would auto-switch to the next server when the
    // current one had a 403/network error. That caused mid-playback stream
    // switches when a CDN momentarily rate-limited (which is normal — hls.js
    // retries automatically with backoff).
    //
    // Now: do nothing on transient errors. Let hls.js retry the same stream
    // via its built-in fragLoadingMaxRetry (3 retries with backoff).
    // Only if the user manually clicks another server do we switch.
    //
    // We still clear the loading state so the spinner doesn't spin forever
    // if the stream truly is dead (in which case the user can manually
    // pick another source from the picker).
    console.log(`[WatchPage] Provider ${_provider} reported failure — keeping current selection (no auto-switch)`);
    setStreamError(null);
    setStreamLoading(false);
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

    // ── Update URL to reflect the chosen language ──
    // When the user picks a tab, push a new URL so the language is shareable:
    //   Hindi tab  → /watch/{id}/{ep}/hindi  (covers Hindi/Tamil/Telugu/Malayalam/etc)
    //   Sub tab    → /watch/{id}/{ep}        (default — no language suffix)
    //   Dub tab    → /watch/{id}/{ep}        (default — no language suffix)
    //   Hardsub tab → /watch/{id}/{ep}        (default — no language suffix)
    // We use history.replaceState (not pushState) so each tab click doesn't
    // pollute the back button history — only direct URL navigation creates
    // a back/forward entry.
    if (typeof window !== "undefined") {
      const newLang = t === "hindi" ? "hindi" : null;
      const currentPath = window.location.pathname;
      // Strip any existing /{lang} suffix from the path
      // Match pattern: /watch/{id}/{ep}[/{lang}]
      const m = currentPath.match(/^(\/watch\/[^/]+\/\d+)(?:\/[a-z]+)?\/?$/i);
      if (m) {
        const basePath = m[1];
        const newPath = newLang ? `${basePath}/${newLang}` : basePath;
        if (newPath !== currentPath) {
          window.history.replaceState(null, "", newPath);
          console.log(`[WatchPage] URL updated → ${newPath} (tab=${t})`);
        }
      }
    }

    // Allowed sources for sub/dub/hardsub (all non-Hindi sources — same as Vercel)
    const ALLOWED = new Set(["anineko", "anineko-to", "anikoto", "anichi", "animex", "anidap", "anidb", "miruro", "animepahe", "anikuro", "mioanime", "anistream", "animeonsen", "anivexa", "anivault", "senshi", "animo4", "anibd", "anidao", "byse", "uniquestream", "anikage", "anidap", "mkissa", "anivexa-backup", "animexone", "reanimate", "xanime", "senshi"]); // removed: reanime, anikai, animeheaven

    // Auto-select the best server for the new translation mode.
    // This way the user doesn't have to manually pick a server when switching.
    setSelectedServer(prev => {
      if (!serverList || serverList.length === 0) return prev;

      let best: ServerEntry | undefined;

      if (t === "hindi") {
        // Hindi: prefer AnimeSalt Hindi (multi-audio, direct m3u8), then fall
        // back to any other animesalt language (Tamil/Telugu/etc — same stream,
        // different audio track picked by the player).
        // AnixTV removed — anixtv.in is offline. Replaced by animesalt.cx.
        best = serverList.find(s => s.source === "animesalt" && s.provider === "hindi")
            || serverList.find(s => s.source === "animesalt");
      } else if (t === "dub") {
        // Dub: find dub server from allowed sources only
        // Priority: Dao (Dub)  AniNeko > AnimeX mimi > AniKoto > other dub
        best = serverList.find(s => (s.source === "anidao" || s.id?.includes("anidao")) && s.type === "dub" && !s.isEmbed)
            || serverList.find(s => (s.source === "anineko-to" || s.source === "anineko" || s.id?.includes("anineko")) && s.type === "dub" && !s.isEmbed)
            || serverList.find(s => s.id === "animex:mimi:dub")
            || serverList.find(s => (s.source === "anikoto" || s.source === "anichi" || s.id?.includes("anikoto") || s.id?.includes("anichi")) && s.type === "dub" && !s.isEmbed)
            || serverList.find(s => s.type === "dub" && ALLOWED.has(s.source))
            || serverList.find(s => s.type === "dub");
      } else if (t === "hardsub") {
        // Hardsub: true hardsub servers from allowed sources
        best = serverList.find(s => s.type === "sub" && s.hardsub === true && ALLOWED.has(s.source))
            || serverList.find(s => s.type === "sub" && s.hardsub === true)
            || serverList.find(s => s.type === "sub" && ALLOWED.has(s.source))
            || serverList.find(s => s.type === "sub");
      } else {
        // Priority: Chopper HD (AniNeko) → Inazuma Sub (AniKoto) → Dao HD → others
        best = serverList.find(s => (s.source === "anineko-to" || s.source === "anineko" || s.id?.includes("anineko")) && s.type === "sub" && !s.isEmbed && !s.hardsub)
            || serverList.find(s => (s.source === "anikoto" || s.source === "anichi" || s.id?.includes("anikoto") || s.id?.includes("anichi")) && s.type === "sub" && !s.isEmbed)
            || serverList.find(s => (s.source === "anidao" || s.id?.includes("anidao")) && s.type === "sub" && !s.isEmbed && !s.hardsub)
            || serverList.find(s => s.id === "animex:mimi:sub")
            || serverList.find(s => s.type === "sub" && s.hardsub !== true && ALLOWED.has(s.source))
            || serverList.find(s => s.type === "sub" && ALLOWED.has(s.source))
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
              String(info?.description || "").replace(/<[^>]*>/g, "") || ""
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
  // THUMBNAIL FALLBACK: Animex scraper (real episode titles)
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
        // We fetch Animex enrichment data in the BACKGROUND (Step 2)
        // so episodes show instantly without waiting for 3 API calls.
        const alRes = await Promise.race([
          fetch("/api/anilist", {
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

        // ── Animex enrichment happens in BACKGROUND (Step 2) ──
        // For now, use empty map — episodes show instantly from AniList data.
        // Animex titles will be merged in later.
        const animexByNum = new Map<number, any>();

        // Fetch Animex in background (don't block episode display)
        (async () => {
          try {
            const [animexRes] = await Promise.allSettled([
              fetch(`/api/anime/scraper/episodes/animex/${anilistId}`).then(r => r.ok ? r.json() : null),
            ]);
            if (cancelled) return;

            const animexEps = animexRes.status === 'fulfilled' && animexRes.value?.episodes ? animexRes.value.episodes : [];

            if (animexEps.length === 0) return;

            // WRONG-SEASON GUARD: if the scraper returned significantly more
            // episodes than AniList says this season has, the scraper matched
            // the wrong season via title search (e.g. Slime S2 anilistId →
            // scraper matched S1's 24-26 episode entry). Drop the enrichment
            // entirely — those titles belong to a different season.
            const maxScraperEp = Math.max(...animexEps.map((e: any) => Number(e.number) || 0));
            if (
              totalEps > 0 && maxScraperEp > totalEps &&
              (maxScraperEp >= totalEps * 1.5 || maxScraperEp - totalEps >= 2)
            ) {
              console.warn(
                `[watch-page] Discarding animex enrichment: scraper returned ${maxScraperEp} eps ` +
                `but AniList says ${totalEps} — likely wrong-season match (anilistId=${anilistId})`
              );
              return;
            }

            // Merge enrichment data into existing episode list
            setEpisodeList(prev => {
              if (prev.length === 0) return prev;
              const updated = [...prev];
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

          // 2) Fill remaining episodes using Animex titles
          if (finalTotal > 0) {
            for (let i = 1; i <= finalTotal; i++) {
              if (!all.has(i)) {
                const animexEp = animexByNum.get(i);
                const title = animexEp?.title || `Episode ${i}`;
                const thumb = undefined;
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

  // ── Fetch AniNeko.to servers — START IMMEDIATELY (don't wait for animeTitle) ──
  // AniNeko.to has its own dedicated endpoint for reliability.
  // The server endpoint resolves the title from AniList cache if not provided.
  useEffect(() => {
    if (!anilistId) return;
    let cancelled = false;

    // Build URL — include title if available for faster server-side resolution
    const titleParam = animeTitle ? `?title=${encodeURIComponent(animeTitle)}` : "";

    // Fetch AniNeko.to servers (direct m3u8 + soft sub subtitles)
    fetch(`/api/anime/anineko-to-servers/${anilistId}/${episodeNum}${titleParam}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.servers?.length) return;
        setServerList(prev => {
          const newServers = dedupeNew(prev, data.servers);
          if (newServers.length === 0) return prev;
          console.log(`[WatchPage] AniNeko.to: added ${newServers.length} servers`);
          const combined = [...prev, ...newServers];
          // Update availability flags
          setSoftsubAvailable(combined.some((s: ServerEntry) => s.type === "sub"));
          setDubAvailable(combined.some((s: ServerEntry) => s.type === "dub"));
          setStreamLoading(false);
          return combined;
        });
        // Auto-select AniNeko (Chopper HD) — but ONLY if nothing better is already selected.
        // Priority: Chopper HD (AniNeko) → Inazuma Sub (AniKoto) → Dao HD
        // IMPORTANT: Skip hardsub servers — pick soft-sub (no hardsub flag) first.
        // Also: DON'T guard with "if prev includes anineko" — the AniNeko useEffect
        // runs twice (once with partial server list, once with full list). The first
        // run might pick a hardsub server, the second run has the full list and can
        // pick the better soft-sub server. We MUST allow overriding the first pick.
        setSelectedServer(prev => {
          // Only keep prev if it's NOT an anineko server (something better already selected)
          if (prev && !prev.includes("anineko")) return prev;
          // First try: soft-sub, non-embed (best — has separate subtitle tracks)
          const subServer = data.servers.find((s: ServerEntry) => s.type === "sub" && !s.isEmbed && !s.hardsub);
          // Fallback: any non-embed sub server (including hardsub)
          const fallbackServer = subServer || data.servers.find((s: ServerEntry) => s.type === "sub" && !s.isEmbed);
          if (fallbackServer) {
            console.log(`[WatchPage] AniNeko auto-selected: ${fallbackServer.id}`);
            return fallbackServer.id;
          }
          return prev;
        });
      })
      .catch(() => { /* best-effort */ });

    return () => { cancelled = true; };
  }, [anilistId, episodeNum, animeTitle]);

  // ── AniDao — dedicated effect that WAITS for the title before fetching ──
  // AniDao's scraper needs the English title to resolve the slug on anidao.to
  // (e.g. "One Piece" → /anime/one-piece). Without the title, it returns 0
  // servers. The main server-fetch effect runs before the title arrives from
  // AniList, so we need this separate effect that depends on animeTitle.
  useEffect(() => {
    if (!anilistId || !animeTitle) return; // wait for title
    let cancelled = false;

    const titleParam = `?title=${encodeURIComponent(animeTitle)}`;
    fetch(`/api/anime/anidao-servers/${anilistId}/${episodeNum}${titleParam}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.servers?.length) return;
        setServerList(prev => {
          const newServers = dedupeNew(prev, data.servers);
          if (newServers.length === 0) return prev;
          console.log(`[WatchPage] AniDao: added ${newServers.length} servers (title="${animeTitle}")`);
          const combined = [...prev, ...newServers];
          serverListRef.current = combined;
          setSoftsubAvailable(combined.some((s: ServerEntry) => s.type === "sub"));
          setDubAvailable(combined.some((s: ServerEntry) => s.type === "dub"));
          return combined;
        });
        // Try auto-select — Dao is #1 priority
        tryAutoSelectRef.current?.(data.servers);
      })
      .catch(() => { /* best-effort */ });

    return () => { cancelled = true; };
  }, [anilistId, episodeNum, animeTitle]);
  // ── AnimeSalt Hindi/Tamil/Telugu/English/Japanese multi-audio (standalone) ──
  // AnimeSalt.cx hosts multi-audio HLS streams via the ASCDN player.
  // Replaces the old AnixTV scraper (anixtv.in is now offline).
  // Returns one server per detected language (Hindi, Tamil, Telugu, English,
  // Japanese, Malayalam, Bengali, Marathi, Kannada — depending on availability).
  // All languages resolve to the SAME multi-audio m3u8 — the player picks the
  // audio track via the HLS audio group.
  //
  // ── AnimeSalt + other Hindi sources ──
  useEffect(() => {
    if (!anilistId) return;
    let cancelled = false;

    // AnimeSalt
    fetch(`/api/anime/animesalt-servers/${anilistId}/${episodeNum}${animeTitle ? `?title=${encodeURIComponent(animeTitle)}` : ""}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.servers?.length) return;
        setServerList(prev => {
          const newServers = dedupeNew(prev, data.servers);
          if (newServers.length === 0) return prev;
          console.log(`[WatchPage] AnimeSalt: added ${newServers.length} server(s), languages: ${(data.languages || []).join(", ")}, slug: ${data.matchedSlug}, season ${data.season}`);
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

  // ── Client-side server cache (5min TTL) ──
  // Prevents re-fetching all 14+ API endpoints on every mount/episode change.
  // Keyed by URL, stores {data, timestamp}. Expired entries purged on access.
  const serverCacheRef = useRef<Map<string, { data: any; ts: number }>>(new Map());
  const serverListRef = useRef<ServerEntry[]>([]);
  const tryAutoSelectRef = useRef<(servers: ServerEntry[], delay?: number) => void>(() => {});
  const SERVER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const cachedFetch = useCallback(async (url: string, timeoutMs: number = 15000): Promise<any | null> => {
    const cache = serverCacheRef.current;
    const cached = cache.get(url);
    if (cached && Date.now() - cached.ts < SERVER_CACHE_TTL) {
      console.log(`[ServerCache] HIT ${url}`);
      return cached.data;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!r.ok) return null;
      const data = await r.json();
      cache.set(url, { data, ts: Date.now() });
      return data;
    } catch (err) {
      console.warn(`[cachedFetch] FAILED ${url} — ${err instanceof Error ? err.message : 'unknown'}`);
      return null;
    }
  }, []);

  // ── Fetch server list — EACH SOURCE FETCHED INDEPENDENTLY ──
  // No instant-servers mega-bundle. No slow/fast group fetches.
  // Each source has its own API route and fetches independently.
  // If one source is slow/times out, the others still arrive and show.
  // Priority: anineko → anikoto → animex → anidap → anilight → anidb → miruro
  useEffect(() => {
    if (!anilistId) return;
    let cancelled = false;
    // ── Reset server state for the new episode ──
    // Clear selectedServer + serverList + serverListRef so auto-select picks
    // a fresh server for the new episode. WITHOUT clearing these, stale ep 5
    // servers would mix with new ep 6 servers in tryAutoSelect.
    //
    // DON'T clear serverCacheRef — it caches API responses by URL (which
    // includes the episode number). The cache speeds up re-visits to the
    // same episode. Each episode has a different URL so there's no cross-
    // contamination. Clearing it would add 2-3 sec delay on every switch.
    //
    // NULL out streamData so the player UNMOUNTS — old video stops playing
    // immediately. The "Loading episode X..." overlay shows on a black screen.
    setServerList([]);
    setSelectedServer("");
    serverListRef.current = [];
    setStreamLoading(true);
    setStreamError(null);
    setStreamData(null);
    // Only show loading screen on FIRST visit (not episode changes)
    if (!hasShownLoadingScreen) {
      setPlayerReady(false);
      setHasShownLoadingScreen(true);
    }

    const ALLOWED_SOURCES = new Set([
      "anineko", "anineko-to", "anikoto", "anichi", "animex", "anidap", "anidb", "miruro",
      "animepahe", "anikuro", "mioanime", "anistream", "animeonsen", "anivexa", "anivault",
      "senshi", "animo4", "anibd", "anidao", "byse", "uniquestream", "xanime", "senshi",
    ]); // removed: animeheaven (Shanks — unreliable), luna, anilight (user requested removal)
    const HINDI_SOURCES = new Set(["animostream", "watchanimeworld", "blakite", "desidub"]);
    // AnimeSalt is multi-audio: it has Hindi/Tamil/Telugu (Indian) AND
    // English/Japanese servers. Only the Indian-language AnimeSalt servers
    // belong in the Hindi tab — English goes to Dub tab, Japanese goes to Sub.
    const INDIAN_LANGS = new Set([
      "hindi", "tamil", "telugu", "malayalam", "bengali", "marathi", "kannada",
    ]);
    const isHindiSource = (s: ServerEntry): boolean => {
      if (s.source === "animesalt") {
        // AnimeSalt: classify by provider (language name)
        return INDIAN_LANGS.has((s.provider || "").toLowerCase());
      }
      return HINDI_SOURCES.has(s.source);
    };

    // Helper: merge new servers + update availability flags
    const mergeServers = (sourceName: string, incoming: ServerEntry[]) => {
      if (cancelled || !incoming.length) return;
      setServerList(prev => {
        const newServers = dedupeNew(prev, incoming);
        if (newServers.length === 0) return prev;
        const combined = [...prev, ...newServers];
        serverListRef.current = combined; // keep ref in sync for tryAutoSelect
        setDubAvailable(combined.some((s: ServerEntry) => s.type === "dub" && !isHindiSource(s)));
        setHardsubAvailable(combined.some((s: ServerEntry) => s.type === "sub" && s.hardsub === true));
        setSoftsubAvailable(combined.some((s: ServerEntry) => s.type === "sub" && !isHindiSource(s)));
        setHindiAvailable(combined.some((s: ServerEntry) => isHindiSource(s)));
        if (combined.length > 0) setStreamLoading(false);
        console.log(`[WatchPage] ${sourceName}: +${newServers.length} servers (total: ${combined.length})`);
        return combined;
      });
    };

    // Helper: auto-select best server (only if none selected yet)
    // ── PRIORITY (user-reported: Inazuma is fastest, lock it once selected) ──
    //   1. Inazuma Sub (AniKoto/AniChi) — Megaplay direct + VidWish subs
    //      ✓ User says: "imazume is fastest comes fast... auto select imazume ok imazume sub ok dont swith ok"
    //   2. Chopper HD (AniNeko/AniNeko-to) — vivibebe.site + anizara subs
    //   3. Dao HD (AniDao) — vivibebe.site + anizara subs
    //   4. Hancock/Megaplay direct
    //   5. AniDap mimi / AnimeX mimi
    //   6. Other
    //
    // IMPORTANT: Inazuma OVERRIDES any other selection when it arrives.
    // User said: "auto select imazume server any even it take to much to show up"
    // So even if Chopper/Dao was picked first (because Inazuma was slow to load),
    // we switch to Inazuma the moment it arrives. Once Inazuma is selected, we
    // stick with it (no more overrides).
    const tryAutoSelect = (incomingServers: ServerEntry[], delay = 0) => {
      if (!incomingServers.length) return;
      const doSelect = () => {
        setSelectedServer(prev => {
          // Use ALL accumulated servers + incoming for best pick
          const allServers = [...serverListRef.current, ...incomingServers];

          // ── PREFERRED SERVER (from Settings) ──
          // If the user set a preferred server in Settings, try to select it
          // when it arrives. This overrides Inazuma auto-select.
          if (prefs.preferredServer && !language) {
            const preferred = allServers.find(s => s.source === prefs.preferredServer);
            if (preferred && prev !== preferred.id) {
              console.log(`[WatchPage] Auto-selected (preferred server): ${preferred.id} (${preferred.name})`);
              return preferred.id;
            }
          }

          // ── INAZUMA OVERRIDE ──
          // If Inazuma (AniKoto / AniChi) is available, ALWAYS prefer it.
          // Even if another server was already selected, switch to Inazuma
          // when it arrives. User explicitly wants Inazuma as the auto-select.
          // (Unless we're matching a language hint from the URL — Hindi etc.)
          // Skip this if the user has a preferred server set (handled above).
          if (!language && !prefs.preferredServer) {
            const inazumaNow = allServers.find(s =>
              (s.source === "anikoto" || s.source === "anichi") &&
              s.type === "sub" && !s.isEmbed
            );
            if (inazumaNow) {
              // Switch to Inazuma if it wasn't already selected
              if (prev !== inazumaNow.id) {
                console.log(`[WatchPage] Auto-selected (Inazuma override): ${inazumaNow.id} (${inazumaNow.name})`);
              }
              return inazumaNow.id;
            }
          }

          // ── NO OVERRIDE for non-Inazuma servers ──
          // Once a server is selected (and it's not Inazuma being overridden),
          // keep it. This prevents mid-playback switches between Chopper/Dao/etc.
          if (prev) return prev;

          // ── LANGUAGE HINT FROM URL (/watch/{id}/{ep}/{lang}) ──
          // When user lands on /watch/123/1/hindi, auto-select a Hindi server
          // BEFORE trying the default Inazuma→Chopper→Dao priority.
          // Match by checking server.provider (lowercase language name like
          // "hindi", "tamil", "telugu") and server.name (e.g. "AnimeSalt Hindi").
          // Falls through to default priority if no matching server found yet
          // (the user might land before AnimeSalt API returns, so we keep
          // trying on each new batch of incoming servers).
          if (language) {
            const langLower = language.toLowerCase();
            const langMatch = allServers.find(s => {
              if (s.isEmbed) return false;
              // Match provider (lowercase lang name) — e.g. provider="hindi"
              if (s.provider && s.provider.toLowerCase() === langLower) return true;
              // Match server name — e.g. "AnimeSalt Hindi", "AnimeSalt Tamil"
              if (s.name && s.name.toLowerCase().includes(langLower)) return true;
              // Match server id — e.g. "animesalt:hindi:..."
              if (s.id && s.id.includes(`:${langLower}:`)) return true;
              return false;
            });
            if (langMatch) {
              console.log(`[WatchPage] Auto-selected (lang=${langLower}): ${langMatch.id} (${langMatch.name})`);
              return langMatch.id;
            }
            // No matching server yet — fall through to default priority.
            // tryAutoSelect() runs again when more servers arrive, so the
            // language match will be retried on the next batch.
          }

          const inazuma = allServers.find(s =>
            (s.source === "anikoto" || s.source === "anichi") &&
            s.type === "sub" && !s.isEmbed
          );
          const chopper = allServers.find(s =>
            (s.source === "anineko" || s.source === "anineko-to" || s.id?.includes("anineko")) &&
            s.type === "sub" && !s.isEmbed && !s.hardsub
          );
          const dao = allServers.find(s =>
            (s.source === "anidao" || s.id?.includes("anidao")) &&
            s.type === "sub" && !s.isEmbed && !s.hardsub
          );
          const hancock = allServers.find(s =>
            /megaplay/i.test(s.provider || "") &&
            s.type === "sub" && !s.isEmbed
          );
          const anidapMimi = allServers.find(s =>
            s.id === "anidap:mimi:sub" && s.type === "sub" && !s.isEmbed
          );
          const animexMimi = allServers.find(s =>
            s.id === "animex:mimi:sub" && s.type === "sub" && !s.isEmbed
          );
          const anidap = allServers.find(s =>
            s.source === "anidap" && s.type === "sub" && !s.isEmbed
          );
          const animex = allServers.find(s =>
            s.source === "animex" && s.type === "sub" && !s.isEmbed
          );
          const firstSub = allServers.find(s => s.type === "sub" && !s.isEmbed);
          // ── NEW PRIORITY: Inazuma first (fastest), then Chopper, then Dao ──
          const pick = inazuma || chopper || dao || hancock || anidapMimi || animexMimi || anidap || animex || firstSub || allServers[0];

          console.log(`[WatchPage] Auto-selected: ${pick.id} (source: ${pick.source})`);
          return pick.id;
        });
      };
      if (delay > 0) {
        setTimeout(doSelect, delay);
      } else {
        doSelect();
      }
    };
    // Store in ref so the separate AniDao effect can call it
    tryAutoSelectRef.current = tryAutoSelect;

    const animeTitleForFetch = animeTitle || animeTitleRomaji || "";

    // ── 1. AniKoto (Inazuma) — SPLIT into FAST + FULL for instant first load ──
    //
    // PROBLEM: On fresh anime load, the full AniKoto scraper (Megaplay + raw
    // AniKoto) takes 10-20s because raw AniKoto does title resolution, Jikan,
    // episode list, server list, and per-server embed fetches sequentially.
    // The 15s timeout often fires → 0 servers shown → user stares at loading.
    //
    // FIX: Call the FAST endpoint first (?fast=1) which returns ONLY Megaplay
    // direct (sub+dub in parallel) in ~2-4s. This shows "Inazuma Sub/Dub"
    // immediately. Then call the FULL endpoint (default) to get HD-1/HD-2/
    // VidPlay servers, which merge in later.
    cachedFetch(`/api/anime/anikoto-servers/${anilistId}/${episodeNum}?fast=1`, 8000).then(data => {
      console.log(`[WatchPage] AniKoto FAST: ${data?.servers?.length ?? 0} servers`);
      if (!data?.servers?.length) return;
      mergeServers("AniKoto", data.servers);
      tryAutoSelect(data.servers);
    });

    // Full AniKoto (Megaplay + raw HD-1/HD-2/VidPlay) — runs in background,
    // merges when ready. Takes 8-15s but the user already has Inazuma Sub/Dub
    // from the fast call above.
    cachedFetch(`/api/anime/anikoto-servers/${anilistId}/${episodeNum}${animeTitleForFetch ? `?title=${encodeURIComponent(animeTitleForFetch)}` : ""}`, 25000).then(data => {
      console.log(`[WatchPage] AniKoto FULL: ${data?.servers?.length ?? 0} servers`);
      if (!data?.servers?.length) return;
      mergeServers("AniKoto", data.servers);
      tryAutoSelect(data.servers);
    });

    // AniLight REMOVED — user requested removal. API was unreliable and
    // the servers it returned were often duplicates of other sources.

    // ── 2. AniBD — independent fetch ──
    cachedFetch(`/api/anime/anibd-servers/${anilistId}/${episodeNum}`, 45000).then(data => {
      console.log(`[WatchPage] AniBD: ${data?.servers?.length ?? 0} servers`);
      if (!data?.servers?.length) return;
      mergeServers("AniBD", data.servers);
    });

    // ── 4. Xanime.me — multi-CDN m3u8 + soft sub VTTs (English/Indo/Malay/Thai/Viet) ──
    // LIVE scraper — fetches fresh m3u8 URLs every time (no client-side cache).
    // The m3u8 signatures expire every ~24h, so caching would serve stale URLs.
    // Also, the sub/dub type detection depends on the LIVE page content, so
    // caching could show a server in the wrong tab if the page changed.
    //
    // Direct fetch (NOT cachedFetch) — always gets the latest response.
    {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      fetch(`/api/anime/xanime-servers/${anilistId}/${episodeNum}`, { signal: controller.signal })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          clearTimeout(timeout);
          console.log(`[WatchPage] Xanime: ${data?.servers?.length ?? 0} servers${data?.reason ? ` (${data.reason})` : ""}`);
          if (!data?.servers?.length) return;
          // Log the type of each server so we can verify sub/dub classification
          for (const s of data.servers) {
            console.log(`  [Xanime] ${s.name}: type=${s.type} hardsub=${s.hardsub} subs=${(s.subtitleTracks || []).length}`);
          }
          mergeServers("Xanime", data.servers);
          tryAutoSelect(data.servers);
        })
        .catch(() => { clearTimeout(timeout); /* best-effort */ });
    }

    // ── Senshi.to (Deo) — vidcloud API, clean m3u8 + subtitles ──
    cachedFetch(`/api/anime/senshi-servers/${anilistId}/${episodeNum}${animeTitleForFetch ? `?title=${encodeURIComponent(animeTitleForFetch)}` : ""}`, 25000).then(data => {
      console.log(`[WatchPage] Senshi: ${data?.servers?.length ?? 0} servers`);
      if (!data?.servers?.length) return;
      mergeServers("Senshi", data.servers);
      tryAutoSelect(data.servers);
    });

    // ═══════ REMOVED DEAD SCRAPERS ═══════
    // AniKai — REMOVED: flixcloud.cc uses Cloudflare Turnstile + WASM-encrypted m3u8
    //          with IP-bound JWT tokens. Cannot be scraped server-side or proxied.
    // AniChi — no logs at all, not running
    // AniKage — 0 streams on ALL anime (koto/kiwi/wave/megg/dib all dead)
    // AniDap — chad.anidap.lol rate-limited long-term, 0 streams on all anime
    // Mkissa — api.mkissa.net returning 0 servers on all 15 attempts
    // AniDB — uses chad.anidap.lol (dead), only "No match" errors
    // 4animo — no logs at all, not running
    // Byse — only "No match" errors on every anime
    // AnimeX.one — no logs at all, not running
    // Reanime — REMOVED (flixcloud.cc WASM encryption too complex, CDN blocks VPS IP)

    // ── 19b. AniDao — REMOVED from main effect (now has dedicated effect above
    //    that waits for animeTitle before fetching, since AniDao needs the title
    //    for slug resolution on anidao.to) ──

    // Safety: if no servers arrive after 15s, clear loading
    // (was 25s — reduced because we removed 15+ dead/slow sources)
    setTimeout(() => {
      if (!cancelled) {
        setServerList(prev => {
          if (prev.length === 0) {
            setStreamLoading(false);
            setStreamError("No servers available for this episode.");
          }
          return prev;
        });
      }
    }, 15000);

    return () => { cancelled = true; };
  }, [anilistId, episodeNum]);

  // ── Fetch skip times (PERSISTENT across provider switches) ──
  // PRIMARY: AniSkip (community DB — most reliable, well-tested)
  useEffect(() => {
    if (!anilistId || !episodeNum) return;
    let cancelled = false;
    setAniskipData({ intro: null, outro: null }); // reset on episode change

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

    // AniSkip is the PRIMARY source and covers most anime reliably.
    // Server intro/outro is picked up from individual server responses
    // (anikoto/anichi servers include intro/outro in their responses).

    return () => { cancelled = true; };
  }, [anilistId, episodeNum, animeTitle]);

  // ── Play stream from selected server (INSTANT — no second API call) ──
  // The streamUrl is already verified and included in the server list.
  // Switching servers is instant — just set the stream data.
  //
  // IMPORTANT: This effect depends on [selectedServer, serverList].
  // serverList IS needed as a dep — when new servers arrive and auto-select
  // picks one, the effect needs to re-run to find the server in the list.
  //
  // To prevent the HLS player from being destroyed/recreated when serverList
  // changes (which was the original bug), we check if streamData is already
  // set for the current selectedServer. If it is, we SKIP — don't recreate.
  const effectiveSkipRef = useRef(effectiveSkip);
  effectiveSkipRef.current = effectiveSkip;

  useEffect(() => {
    if (!selectedServer) return;
    const server = serverList.find(s => s.id === selectedServer) || serverListRef.current.find(s => s.id === selectedServer);
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
    const isM3U8 = (server as any).isM3U8 === true;
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
    // For embed servers (AniWaves, etc.): load the URL directly in an iframe.
    // Hindi embed servers (AnimoStream, WatchAnimeWorld, Blakite, DesiDub) use
    // /api/embed/proxy which:
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
    // NOTE: AnimeSalt returns direct m3u8 (not embed) — handled by the standard
    // /p/{token} proxy path with the animesalt.cx Referer rule.
    const noProxy = (server as any).noProxy === true;
    const useEmbedProxy = (server as any).useEmbedProxy === true;
    const isHindiEmbedSource = (server as any).source === "animostream" || (server as any).source === "watchanimeworld" || (server as any).source === "blakite" || (server as any).source === "desidub";
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
          // and serves with ALLOWALL. For CF-protected Hindi dub sites like
          // animostream and watchanimeworld, the proxy internally routes
          // through the CF Worker to bypass bot protection.
          finalStreamUrl = `/api/embed/proxy?url=${encodeURIComponent(u.toString())}&ref=${encodeURIComponent(u.origin + "/")}`;
        } else {
          // Route through our Cloudflare Worker proxy — it sends the correct
          // Referer/Origin and serves the page with X-Frame-Options: ALLOWALL
          // so our iframe can load it.
          const WORKER_BASE = process.env.NEXT_PUBLIC_PROXY_BASE || "https://api.luffytv.live";
          finalStreamUrl = `${WORKER_BASE}/proxy?url=${encodeURIComponent(u.toString())}&ref=${encodeURIComponent(u.origin + "/")}`;
        }
      } catch { /* if URL parsing fails, use original */ }
    }

    // Skip times priority (PERSISTENT across provider switches):
    // 1. AniSkip (community DB, fetched separately — most reliable)
    // 2. Server's own intro/outro (from instant-servers, baked into server entry)
  // Find the current episode thumbnail (episode-specific screenshot from AniList)
  const currentEpThumb = episodeList.find(e => e.number === episodeNum)?.thumbnail;

    //
    // All values are validated — bad data (start=0, swapped intro/outro,
    // too-short intervals) is filtered out before reaching the player.
    const subtitleTracks = (server as ServerEntry).subtitleTracks || [];
    const serverIntro = validateSkipTime((server as ServerEntry).intro ?? null, "intro");
    const serverOutro = validateSkipTime((server as ServerEntry).outro ?? null, "outro");
    const intro = effectiveSkipRef.current.intro ?? serverIntro ?? null;
    const outro = effectiveSkipRef.current.outro ?? serverOutro ?? null;

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
      hardsub: !!(server as ServerEntry).hardsub,
      // Pass megaplay fileId through to the HLS player for client-side resolution
      megaplayFileId: (server as any).megaplayFileId,
      megaplayAudio: (server as any).megaplayAudio,
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
        thumbnail: currentEpThumb || animeImage || undefined,
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
      setSelectedServer={(id: string) => {
        setSelectedServer(id);
        // ── Update URL when user manually clicks a server ──
        // If the clicked server has a known language (e.g. AnimeSalt Tamil),
        // update the URL suffix to match so the language is shareable.
        // If a non-language server is picked (Inazuma, Chopper, etc.), strip
        // the language suffix from the URL.
        if (typeof window !== "undefined") {
          const server = serverList.find(s => s.id === id);
          const currentPath = window.location.pathname;
          const m = currentPath.match(/^(\/watch\/[^/]+\/\d+)(?:\/[a-z]+)?\/?$/i);
          if (m && server) {
            const INDIAN_LANGS = new Set([
              "hindi", "tamil", "telugu", "malayalam", "bengali", "marathi", "kannada",
            ]);
            let newLang: string | null = null;
            // Check server.provider (lowercase lang name) — e.g. "hindi", "tamil"
            if (server.provider && INDIAN_LANGS.has(server.provider.toLowerCase())) {
              newLang = server.provider.toLowerCase();
            }
            // Check server.id for pattern like "animesalt:tamil:..."
            else if (server.id) {
              const idMatch = server.id.match(/:(hindi|tamil|telugu|malayalam|bengali|marathi|kannada):/i);
              if (idMatch) newLang = idMatch[1].toLowerCase();
            }
            // Check server.name — e.g. "AnimeSalt Hindi"
            else if (server.name) {
              const lc = server.name.toLowerCase();
              for (const lang of INDIAN_LANGS) {
                if (lc.includes(lang)) { newLang = lang; break; }
              }
            }
            const basePath = m[1];
            const newPath = newLang ? `${basePath}/${newLang}` : basePath;
            if (newPath !== currentPath) {
              window.history.replaceState(null, "", newPath);
              console.log(`[WatchPage] URL updated → ${newPath} (server=${server.name})`);
            }
          }
        }
        setSelectedServer(id);
      }}
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
      fullscreenRetain={fullscreenRetain}
      setFullscreenRetain={setFullscreenRetain}
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
      theaterMode={theaterMode}
      setTheaterMode={setTheaterMode}
      synopsisExpanded={synopsisExpanded}
      setSynopsisExpanded={setSynopsisExpanded}
      animeId={animeId}
      playerReady={playerReady}
      onCanPlay={() => {
        setPlayerReady(true);
        // ── Fullscreen Retain: re-enter fullscreen after new episode loads ──
        // When switching episodes while in fullscreen, the old player unmounts
        // (key change), browser auto-exits fullscreen, new player mounts, and
        // we need to re-enter fullscreen on the new container.
        // Browsers may block requestFullscreen() if not triggered by a user
        // gesture — but since the episode switch was initiated by a user
        // click (Next/Prev button), the "transient activation" window is
        // usually still open. We retry up to 3 times with increasing delay.
        if (fullscreenRetain && wasFullscreenRef.current) {
          wasFullscreenRef.current = false;
          const tryFullscreen = (attempt: number) => {
            const el = document.getElementById("hls-player-container")
              || document.querySelector("[data-player-container]")
              || document.querySelector("video")?.parentElement;
            if (el && !(document.fullscreenElement || (document as any).webkitFullscreenElement)) {
              (el as HTMLElement).requestFullscreen?.().catch(() => {
                // Retry up to 3 times with increasing delay (300ms, 600ms, 1000ms)
                if (attempt < 3) {
                  setTimeout(() => tryFullscreen(attempt + 1), 300 + attempt * 300);
                }
              });
            }
          };
          // Initial attempt after 100ms (let the player DOM stabilize)
          setTimeout(() => tryFullscreen(1), 100);
        }
      }}
      animeBackdrop={animeImage || undefined}
    />
    </>
  );
}
