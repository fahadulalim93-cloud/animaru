/**
 * AniKuro API Client
 * ------------------
 * AniKuro (https://anikuro.ru) is a Russian anime aggregator with a public
 * REST API at /api/v1/. It uses AniList IDs directly (no slug resolution).
 *
 * API flow:
 *   1. GET https://anikuro.ru/api/v1/anime/{anilistId}/episodes
 *      → episode list with TVDB metadata
 *   2. GET https://anikuro.ru/api/v1/sources/{provider}/{anilistId}:{epNum}
 *      → stream URLs proxied through proxy.anikuro.ru (base64-encoded)
 *
 * Supported providers:
 *   animepahe, anikoto, reanime, animedao, animegg, anidb, animedunya,
 *   animeverse, allani, senshi, animix
 *
 * Stream URL format:
 *   https://proxy.anikuro.ru/{base64(originalUrl|referer)}.{m3u8|mp4}?proxy=0
 *
 * The proxy.anikuro.ru URL is directly playable in the browser (permissive CORS).
 */

const ANIKURO_API = "https://anikuro.ru/api/v1";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://anikuro.ru/",
};

// All supported providers — these are the source scrapers AniKuro aggregates
export const ANIKURO_PROVIDERS = [
  "animepahe",
  "anikoto",
  "reanime",
  "animedao",
  "animegg",
  "anidb",
  "animedunya",
  "animeverse",
  "allani",
  "senshi",
  "animix",
] as const;

export type AnikuroProvider = typeof ANIKURO_PROVIDERS[number];

// Display names for the providers
export const ANIKURO_PROVIDER_NAMES: Record<string, string> = {
  animepahe: "AnimePahe",
  anikoto: "AniKoto",
  reanime: "ReAnime",
  animedao: "AnimeDao",
  animegg: "AnimeGG",
  anidb: "AniDB",
  animedunya: "AnimeDunya",
  animeverse: "AnimeVerse",
  allani: "AllAnime",
  senshi: "Senshi",
  animix: "AniMix",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnikuroSource {
  url: string;
  quality: string;
  type?: string;
  isM3U8?: boolean;
  headers?: Record<string, string>;
}

export interface AnikuroVariant {
  provider: string;
  episodeId: string;
  animeId: number;
  episodeNumber: number;
  variant: "sub" | "dub";
  sources: AnikuroSource[];
  headers?: Record<string, string>;
  tracks?: Array<{ url: string; lang: string; label: string }>;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}

export interface AnikuroEpisode {
  id: string;          // "21:1"
  animeId: number;
  number: number;
  displayNumber: string;
  title: string;
  image?: string;
  thumbnail?: string;
  description?: string;
  airDateUtc?: string;
}

// ─── Episode List ─────────────────────────────────────────────────────────────

export async function getAnikuroEpisodes(
  anilistId: number,
  timeoutMs = 8000
): Promise<AnikuroEpisode[]> {
  const url = `${ANIKURO_API}/anime/${anilistId}/episodes`;
  try {
    const res = await Promise.race([
      fetch(url, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return [];
    const data = await res.json();
    const payload = data?.ok ? data.data : data;
    return Array.isArray(payload?.episodes) ? payload.episodes : [];
  } catch {
    return [];
  }
}

// ─── Sources (Stream URLs) ────────────────────────────────────────────────────

export interface AnikuroSourcesResponse {
  provider: string;
  variants: AnikuroVariant[];
}

/**
 * Fetch stream sources from a specific AniKuro provider.
 *
 * @param anilistId  AniList ID (used directly by AniKuro)
 * @param epNum      Episode number
 * @param provider   One of ANIKURO_PROVIDERS
 */
export async function getAnikuroSources(
  anilistId: number,
  epNum: number,
  provider: string,
  timeoutMs = 8000
): Promise<AnikuroVariant[] | null> {
  const episodeId = `${anilistId}:${epNum}`;
  const url = `${ANIKURO_API}/sources/${provider}/${episodeId}`;
  try {
    const res = await Promise.race([
      fetch(url, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    const data = await res.json();
    // Response shape: { ok: true, data: { provider, normalized: [...] } }
    const payload = data?.ok ? data.data : data;
    const variants = Array.isArray(payload?.normalized) ? payload.normalized : [];
    return variants;
  } catch {
    return null;
  }
}

// ─── Main: Fetch ALL AniKuro providers in parallel ────────────────────────────

export interface AnikuroVerifiedResult {
  provider: string;
  type: "sub" | "dub";
  streamUrl: string;
  quality: string;
  isM3U8: boolean;
  isMP4: boolean;
  hardsub: boolean;
  tracks: Array<{ url: string; lang: string; label: string }>;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
}

/**
 * Fetch ALL AniKuro sources for an anime episode.
 * Tries every supported provider in parallel.
 */
export async function fetchAnikuroSources(
  anilistId: number,
  epNum: number,
  options?: { sub?: boolean; dub?: boolean; timeoutMs?: number }
): Promise<AnikuroVerifiedResult[]> {
  const wantSub = options?.sub ?? true;
  const wantDub = options?.dub ?? true;
  const timeoutMs = options?.timeoutMs ?? 6000;

  const verified: AnikuroVerifiedResult[] = [];

  // Fetch all providers in parallel
  const results = await Promise.allSettled(
    ANIKURO_PROVIDERS.map(async (provider): Promise<AnikuroVerifiedResult[]> => {
      const variants = await getAnikuroSources(anilistId, epNum, provider, timeoutMs);
      if (!variants || variants.length === 0) return [];

      const out: AnikuroVerifiedResult[] = [];
      for (const v of variants) {
        // Filter by sub/dub preference
        if (v.variant === "sub" && !wantSub) continue;
        if (v.variant === "dub" && !wantDub) continue;

        // Use the first source (usually best quality)
        const src = v.sources?.[0];
        if (!src?.url) continue;

        // AniKuro proxy URLs are directly playable (CORS enabled)
        const url = src.url;
        const isM3U8 = url.includes(".m3u8") || src.isM3U8 === true || src.type === "hls";
        const isMP4 = url.includes(".mp4") || src.type === "mp4";

        out.push({
          provider,
          type: v.variant,
          streamUrl: url,
          quality: src.quality || "default",
          isM3U8,
          isMP4,
          hardsub: false,
          tracks: (v.tracks || []).filter(t => t?.url),
          intro: v.intro,
          outro: v.outro,
        });
      }
      return out;
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      verified.push(...r.value);
    }
  }

  console.log(`[AniKuro] ${verified.length} streams from ${ANIKURO_PROVIDERS.length} providers`);
  return verified;
}
