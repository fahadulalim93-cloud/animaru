// AniVexa API Client — https://anivexa-api-tawny.vercel.app
//
// Cleaned up — only keeping providers that work:
//   - anineko: HLS embed URLs (vibeplayer, bibiemb, otakuhg, otakuvid) — RELIABLE iframe
//   - allmanga: AllAnime/Zenith — direct MP4 + iframe embeds (6+ sources per ep)
//
// Removed (broken/unused):
//   - anikoto: HLS + embeds — unreliable, removed
//   - animegg: MP4 + embed — broken, removed

const ANIVEXA_API = "https://anivexa-api-tawny.vercel.app";

// ─── Provider Config ──────────────────────────────────────────────────────────

export const ANIVEXA_PROVIDERS = ["anineko", "allmanga"] as const;
export type AnivexaProviderId = (typeof ANIVEXA_PROVIDERS)[number];

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  anineko: "V1",
  allmanga: "V2",
};

const PROVIDER_TIPS: Record<string, string> = {
  anineko: "HLS Embeds, Reliable",
  allmanga: "6+ Sources, MP4+Iframe",
};

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface AnivexaStream {
  url: string;
  type: "hls" | "mp4" | "embed" | "iframe" | "player";
  quality?: string;
  embed?: string;
  audio?: string;
  server?: string;
  priority?: number;
  referer?: string;
  isActive?: boolean;
  default?: boolean;
  backup?: string | null;
  name?: string;
  headers?: Record<string, string>;
  downloads?: any;
}

export interface AnivexaSubtitle {
  file: string;
  label: string;
  kind: string;
  default: boolean;
  language?: string;
  format?: string;
  encoding?: string;
  source?: string;
}

export interface AnivexaWatchResult {
  streams: AnivexaStream[];
  subtitles: AnivexaSubtitle[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  provider: string;
}

// Iframe-able embed domains from anivexa streams
const IFRAMEABLE_DOMAINS = [
  "vibeplayer.site",
  "bibiemb.xyz",
  "otakuhg.site",
  "otakuvid.online",
  // AllManga/AllAnime embeds
  "mp4upload.com",
  "ok.ru",
  "streamlare.com",
  "allanime.day",
  "tools.fast4speed.rsvp",
  "player.ukiku.io",
  "www.mp4upload.com",
  "streamtape.com",
  "megacloud.tv",
];

// ─── Helper Functions ────────────────────────────────────────────────────────

function isIframeable(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return IFRAMEABLE_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`)
    );
  } catch {
    return false;
  }
}

// ─── API Client ─────────────────────────────────────────────────────────────────

// Simple in-memory cache for watch results
const watchCache = new Map<string, { result: AnivexaWatchResult | null; timestamp: number }>();
const WATCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch streams from AniVexa API for a specific provider
 */
export async function anivexaWatch(
  anilistId: number,
  episodeNum: number,
  translationType: "sub" | "dub",
  provider: string = "anineko"
): Promise<AnivexaWatchResult | null> {
  try {
    const audio = translationType === "dub" ? "dub" : "sub";
    const epSlug = `${provider}-${episodeNum}`;
    const url = `${ANIVEXA_API}/watch/${provider}/${anilistId}/${audio}/${epSlug}`;

    // Check cache
    const cacheKey = `${provider}:${anilistId}:${audio}:${episodeNum}`;
    const cached = watchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < WATCH_CACHE_TTL) {
      return cached.result;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        console.warn(`[anivexa] API returned ${res.status} for ${url}`);
        return null;
      }

      const data = await res.json();

      let streams: AnivexaStream[] = [];
      let subtitles: AnivexaSubtitle[] = [];
      let intro: { start: number; end: number } | undefined;
      let outro: { start: number; end: number } | undefined;

      if (data.streams) {
        // anineko format: { streams: [...] }
        streams = data.streams;
        subtitles = data.subtitles || [];
        intro = data.intro || undefined;
        outro = data.outro || undefined;
      } else if (data.sources) {
        // allmanga format: { sources: [...], intro, outro }
        const rawSources: Array<any> = data.sources || [];
        streams = rawSources
          .filter((s: any) => s && s.url)
          .map((s: any) => ({
            url: s.url,
            type: (s.type === "player" ? "mp4" : s.type === "iframe" ? "embed" : s.type || "embed") as AnivexaStream["type"],
            server: s.name || "AllAnime",
            priority: typeof s.priority === "number" ? Math.round(s.priority) : 0,
            referer: s.headers?.Referer || s.headers?.referer || "https://allmanga.to",
            name: s.name,
            headers: s.headers,
          }))
          .sort((a: AnivexaStream, b: AnivexaStream) => (b.priority || 0) - (a.priority || 0));
        intro = data.intro || undefined;
        outro = data.outro || undefined;
      } else {
        console.warn(`[anivexa] Unknown response format from ${provider}`);
        return null;
      }

      if (streams.length === 0) {
        console.warn(`[anivexa] No streams found for ${provider}/${anilistId}/${audio}/${epSlug}`);
        return null;
      }

      console.log(`[anivexa] Found ${streams.length} streams from ${provider}`);

      const result: AnivexaWatchResult = {
        streams,
        subtitles,
        intro,
        outro,
        provider,
      };

      // Cache
      watchCache.set(cacheKey, { result, timestamp: Date.now() });
      if (watchCache.size > 100) {
        const oldest = [...watchCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
        for (let i = 0; i < 50; i++) watchCache.delete(oldest[i][0]);
      }

      return result;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.error(`[anivexa] Watch error:`, e instanceof Error ? e.message : "unknown");
    return null;
  }
}

/**
 * Get the best embed URL from an AniVexa watch result
 * Priority: iframeable embed > iframeable stream > MP4 > HLS stream
 */
export function getBestEmbedUrl(
  result: AnivexaWatchResult
): { url: string; type: "iframe" | "hls" | "mp4" } | null {
  // Priority 1: Iframeable embed URL
  const embedStreams = result.streams.filter(
    s => s.embed && isIframeable(s.embed)
  );
  const urlEmbedStreams = result.streams.filter(
    s => s.url && isIframeable(s.url) && (s.type === "embed" || s.type === "iframe")
  );

  if (embedStreams.length > 0) {
    return { url: embedStreams[0].embed!, type: "iframe" };
  }
  if (urlEmbedStreams.length > 0) {
    return { url: urlEmbedStreams[0].url, type: "iframe" };
  }

  // Priority 2: MP4 stream
  for (const stream of result.streams) {
    if (stream.url && (stream.type === "mp4" || stream.type === "player")) {
      return { url: stream.url, type: "mp4" };
    }
  }

  // Priority 3: HLS stream URL
  for (const stream of result.streams) {
    if (stream.url && stream.type === "hls") {
      return { url: stream.url, type: "hls" };
    }
  }

  return null;
}

/**
 * Check which AniVexa providers are available for a given anime
 */
export async function anivexaCheckProviders(
  anilistId: number
): Promise<string[]> {
  try {
    const url = `${ANIVEXA_API}/episodes/${anilistId}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!res.ok) return [];

      const data = await res.json();
      const availableProviders: string[] = [];

      for (const provider of ANIVEXA_PROVIDERS) {
        const providerData = data[provider];
        if (!providerData) continue;

        const episodes = providerData.episodes;
        if (!episodes) continue;

        const subEps = episodes.sub || [];
        const dubEps = episodes.dub || [];
        if (subEps.length > 0 || dubEps.length > 0) {
          availableProviders.push(provider);
        }
      }

      return availableProviders;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return [];
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────────

export function getProviderDisplayName(provider: string): string {
  return (
    PROVIDER_DISPLAY_NAMES[provider] ||
    provider.charAt(0).toUpperCase() + provider.slice(1)
  );
}

export function getProviderTip(provider: string): string {
  return PROVIDER_TIPS[provider] || "";
}
