/**
 * Miruro Direct Scraper — bypasses the user's deployed miruro-api.vercel.app
 * and hits www.miruro.tv/api/secure/pipe DIRECTLY using the base64url+gzip
 * codec discovered in Shineii86/MiruroAPI.
 *
 * This is server-side only (uses Node's zlib + Buffer). Import only from
 * API routes or server components.
 *
 * Flow:
 *   1. Build pipe payload: { path, method, query, body, version }
 *   2. base64url-encode JSON → ?e={encoded}
 *   3. GET https://www.miruro.tv/api/secure/pipe?e={encoded}
 *   4. Response body is base64url(gzip(json)) → decode → JSON
 *
 * Episode IDs in the pipe are base64-encoded strings like "animepahe:20:sub:1".
 * We deep-translate them to plain text.
 */

import { gunzipSync } from "node:zlib";

const MIRURO_PIPE_URL = "https://www.miruro.tv/api/secure/pipe";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Referer: "https://www.miruro.tv/",
  Origin: "https://www.miruro.tv",
  Accept: "*/*",
};

// ─── Codec ────────────────────────────────────────────────────────────────────

function b64urlEncode(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  return buf.toString("base64url"); // Node 16+: URL-safe, no padding
}

function b64urlDecode(s: string): Buffer {
  // base64url decode — Node's Buffer supports it natively
  return Buffer.from(s, "base64url");
}

export function encodePipeRequest(payload: any): string {
  return b64urlEncode(JSON.stringify(payload));
}

export function decodePipeResponse(encoded: string): any {
  // Miruro returns base64url(gzip(json))
  const compressed = b64urlDecode(encoded);
  const decompressed = gunzipSync(compressed);
  return JSON.parse(decompressed.toString("utf-8"));
}

export function translateId(encodedId: string): string {
  try {
    const decoded = b64urlDecode(encodedId).toString("utf-8");
    // Only return decoded value if it looks like an ID (contains ":")
    if (decoded.includes(":")) return decoded;
    return encodedId;
  } catch {
    return encodedId;
  }
}

export function deepTranslateIds(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(deepTranslateIds);
  }
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      if (k === "id" && typeof obj[k] === "string") {
        obj[k] = translateId(obj[k]);
      } else if (typeof obj[k] === "object") {
        deepTranslateIds(obj[k]);
      }
    }
  }
  return obj;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MiruroDirectEpisode {
  number: number;
  id: string;          // plain-text pipe ID like "animepahe:21:sub:1"
  title?: string;
  thumbnail?: string;
  image?: string;
  isFiller?: boolean;
  filler?: boolean;
  airDate?: string;
  description?: string;
}

export interface MiruroDirectEpisodesResult {
  providers: Record<string, {
    episodes: { sub: MiruroDirectEpisode[]; dub: MiruroDirectEpisode[] };
    meta?: { title?: string };
  }>;
  mappings?: Record<string, any>;
}

export interface MiruroDirectSource {
  url: string;
  quality?: string;
  isM3U8?: boolean;
  type?: string;
  sourceName?: string;
  sourceType?: "internal" | "external";
  /** Per-stream Referer header (e.g., "https://kwik.cx/" for kiwi/uwu streams) */
  referer?: string;
  resolution?: { width?: number; height?: number };
  codec?: string;
  audio?: string;
  fansub?: string;
  isActive?: boolean;
}

export interface MiruroDirectSourcesResult {
  // Miruro returns streams as the primary key (NOT "sources")
  streams?: MiruroDirectSource[];
  sources?: MiruroDirectSource[];  // Some providers use "sources" instead
  subtitles?: Array<{ url: string; lang: string; language?: string }>;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  headers?: Record<string, string>;
  provider?: string;
  tracks?: Array<{ url: string; lang: string; label?: string; kind?: string }>;
  download?: any;
}

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Fetch raw episode data from Miruro's pipe.
 * Internal helper — use getEpisodes() for the public API.
 */
export async function fetchRawEpisodes(anilistId: number): Promise<MiruroDirectEpisodesResult | null> {
  const payload = {
    path: "episodes",
    method: "GET",
    query: { anilistId },
    body: null,
    version: "0.1.0",
  };
  const encoded = encodePipeRequest(payload);
  const url = `${MIRURO_PIPE_URL}?e=${encoded}`;

  try {
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) {
      console.error(`[MiruroDirect] episodes HTTP ${res.status} for anilistId=${anilistId}`);
      return null;
    }
    const text = await res.text();
    const data = decodePipeResponse(text);
    return deepTranslateIds(data) as MiruroDirectEpisodesResult;
  } catch (e: any) {
    console.error(`[MiruroDirect] fetchRawEpisodes failed:`, e?.message || e);
    return null;
  }
}

/**
 * Fetch episode list for an anime by AniList ID.
 * Returns normalized episodes grouped by sub/dub.
 */
export async function getEpisodes(anilistId: number): Promise<{
  sub: MiruroDirectEpisode[];
  dub: MiruroDirectEpisode[];
  providers: string[];
  defaultProvider: string;
  raw: MiruroDirectEpisodesResult | null;
}> {
  const data = await fetchRawEpisodes(anilistId);
  if (!data?.providers) {
    return { sub: [], dub: [], providers: [], defaultProvider: "", raw: null };
  }

  // Pick the provider with the most sub episodes (priority: kiwi, bee, bonk, ...)
  const PRIORITY = ["kiwi", "pewe", "bee", "bonk", "bun", "ally", "nun", "twin", "cog", "moo", "hop", "telli"];
  let bestProvider = "";
  let bestCount = -1;
  for (const name of PRIORITY) {
    const p = data.providers[name];
    if (!p?.episodes) continue;
    const cnt = Math.max(
      (p.episodes.sub || []).length,
      (p.episodes.dub || []).length,
    );
    if (cnt > bestCount) {
      bestCount = cnt;
      bestProvider = name;
    }
  }
  // Fallback: any provider with data
  if (!bestProvider) {
    for (const [name, p] of Object.entries(data.providers)) {
      if (p?.episodes && ((p.episodes.sub || []).length || (p.episodes.dub || []).length)) {
        bestProvider = name;
        break;
      }
    }
  }

  if (!bestProvider) {
    return { sub: [], dub: [], providers: Object.keys(data.providers), defaultProvider: "", raw: data };
  }

  const provData = data.providers[bestProvider];
  return {
    sub: provData.episodes?.sub || [],
    dub: provData.episodes?.dub || [],
    providers: Object.keys(data.providers),
    defaultProvider: bestProvider,
    raw: data,
  };
}

/**
 * Get the pipe episode ID for a specific provider + category + episode number.
 */
export async function getEpisodeId(
  anilistId: number,
  episodeNum: number,
  category: "sub" | "dub" = "sub",
  provider?: string,
): Promise<{ id: string; provider: string } | null> {
  const data = await fetchRawEpisodes(anilistId);
  if (!data?.providers) return null;

  // If provider specified, try it first
  const tryProviders = provider
    ? [provider, ...Object.keys(data.providers).filter(p => p !== provider)]
    : Object.keys(data.providers);

  for (const provName of tryProviders) {
    const p = data.providers[provName];
    if (!p?.episodes) continue;
    const eps = category === "dub" ? p.episodes.dub : p.episodes.sub;
    if (!eps?.length) continue;
    const ep = eps.find(e => Number(e.number) === Number(episodeNum));
    if (ep?.id) {
      return { id: ep.id, provider: provName };
    }
  }
  return null;
}

/**
 * Fetch stream sources (m3u8 URLs) for a specific episode.
 *
 * Args:
 *   episodeId:  The pipe episode ID (e.g., "animepahe:21:sub:1")
 *   provider:   Provider name (e.g., "kiwi", "bee", "bonk")
 *   anilistId:  AniList anime ID
 *   category:   "sub" or "dub"
 */
export async function getSources(
  episodeId: string,
  provider: string,
  anilistId: number,
  category: "sub" | "dub" = "sub",
): Promise<MiruroDirectSourcesResult | null> {
  // The pipe expects the episodeId to be base64url-encoded
  const encId = b64urlEncode(episodeId);

  const payload = {
    path: "sources",
    method: "GET",
    query: {
      episodeId: encId,
      provider,
      category,
      anilistId,
    },
    body: null,
    version: "0.1.0",
  };
  const encoded = encodePipeRequest(payload);
  const url = `${MIRURO_PIPE_URL}?e=${encoded}`;

  try {
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) {
      console.error(`[MiruroDirect] sources HTTP ${res.status} for ep=${episodeId} provider=${provider}`);
      // Log response body for non-200
      try {
        const errBody = await res.text();
        console.error(`[MiruroDirect]   response: ${errBody.slice(0, 200)}`);
      } catch {}
      return null;
    }
    const text = await res.text();
    if (!text || text.length === 0) {
      console.error(`[MiruroDirect] sources: empty response body for ${provider}`);
      return null;
    }
    let data: any;
    try {
      data = decodePipeResponse(text);
    } catch (e: any) {
      console.error(`[MiruroDirect] sources: decode failed for ${provider}: ${e?.message}. First 200 chars: ${text.slice(0, 200)}`);
      return null;
    }
    data = deepTranslateIds(data);
    // Log what we got
    const sourceCount = data?.sources?.length || data?.streams?.length || 0;
    console.log(`[MiruroDirect] ${provider}: decoded OK, ${sourceCount} sources. Top keys: ${Object.keys(data || {}).join(",")}`);
    if (sourceCount === 0) {
      // Log a sample to understand the shape
      console.log(`[MiruroDirect]   full response sample: ${JSON.stringify(data).slice(0, 500)}`);
    }
    return data as MiruroDirectSourcesResult;
  } catch (e: any) {
    console.error(`[MiruroDirect] getSources failed:`, e?.message || e);
    return null;
  }
}

/**
 * List ALL available Miruro servers for a given episode.
 * Returns provider names that have this episode (sub or dub).
 * Fast — only 1 API call to the pipe.
 */
export function getAvailableMiruroServers(
  rawData: MiruroDirectEpisodesResult,
  episodeNum: number,
  category: "sub" | "dub" = "sub"
): Array<{ provider: string; episodeId: string }> {
  if (!rawData?.providers) return [];
  const result: Array<{ provider: string; episodeId: string }> = [];
  for (const [provName, p] of Object.entries(rawData.providers)) {
    if (!p?.episodes) continue;
    const eps = category === "dub" ? p.episodes.dub : p.episodes.sub;
    if (!eps?.length) continue;
    const ep = eps.find(e => Number(e.number) === Number(episodeNum));
    if (ep?.id) {
      result.push({ provider: provName, episodeId: ep.id });
    }
  }
  return result;
}

/**
 * Fetch stream sources for a SPECIFIC provider (not auto-pick).
 * Returns the first playable m3u8 from that provider.
 */
export async function getSourceFromProvider(
  anilistId: number,
  episodeNum: number,
  category: "sub" | "dub" = "sub",
  requestedProvider: string
): Promise<{
  url: string;
  quality: string;
  isM3U8: boolean;
  provider: string;
  subtitles: Array<{ url: string; lang: string; language?: string }>;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  headers: Record<string, string>;
  streamReferer?: string;
  allSources?: MiruroDirectSource[];
} | null> {
  const data = await fetchRawEpisodes(anilistId);
  if (!data?.providers) return null;

  const p = data.providers[requestedProvider];
  if (!p?.episodes) return null;
  const eps = category === "dub" ? p.episodes.dub : p.episodes.sub;
  if (!eps?.length) return null;
  const ep = eps.find(e => Number(e.number) === Number(episodeNum));
  if (!ep?.id) return null;

  try {
    const result = await getSources(ep.id, requestedProvider, anilistId, category);
    const allStreams = (result?.streams || result?.sources || []) as MiruroDirectSource[];
    if (!allStreams.length) return null;

    const m3u8Streams = allStreams.filter(s =>
      s.url && (s.isM3U8 || s.url.includes(".m3u8") || s.type === "hls")
    );
    const mp4Streams = allStreams.filter(s =>
      s.url && (s.url.includes(".mp4") || s.type === "mp4" || (!s.isM3U8 && !s.url.includes(".m3u8")))
    );
    if (m3u8Streams.length === 0 && mp4Streams.length === 0) return null;

    const isHLS = m3u8Streams.length > 0;
    const picked = isHLS
      ? (m3u8Streams.find(s => s.isActive) || m3u8Streams[0])
      : (mp4Streams.find(s => s.isActive) || mp4Streams[0]);

    const subtitles: Array<{ url: string; lang: string; language?: string }> = [];
    const rawTracks: any[] = (result?.tracks || result?.subtitles || []) as any[];
    for (const t of rawTracks) {
      if (!t?.url) continue;
      subtitles.push({
        url: t.url,
        lang: t.lang || "en",
        language: t.label || t.language || t.lang || "English",
      });
    }

    const streamReferer = picked.referer || "https://www.miruro.tv/";
    const headers: Record<string, string> = {
      Referer: streamReferer,
      "User-Agent": HEADERS["User-Agent"],
    };
    if (streamReferer && streamReferer !== "https://www.miruro.tv/") {
      try { headers["Origin"] = new URL(streamReferer).origin; } catch {}
    } else {
      headers["Origin"] = "https://www.miruro.tv";
    }

    return {
      url: picked.url,
      quality: picked.quality || "auto",
      isM3U8: isHLS,
      provider: requestedProvider,
      subtitles,
      intro: result?.intro || undefined,
      outro: result?.outro || undefined,
      headers,
      streamReferer,
      allSources: allStreams,
    };
  } catch (e) {
    console.error(`[MiruroDirect] getSourceFromProvider ${requestedProvider} failed:`, e);
    return null;
  }
}

/**
 * One-shot "give me a playable m3u8 for this episode" function.
 * Tries providers in priority order, returns the first that yields a playable m3u8.
 *
 * Returns null if no provider works.
 */
export async function getPlayableSource(
  anilistId: number,
  episodeNum: number,
  category: "sub" | "dub" = "sub",
): Promise<{
  url: string;
  quality: string;
  isM3U8: boolean;
  provider: string;
  subtitles: Array<{ url: string; lang: string; language?: string }>;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  headers: Record<string, string>;
  /** Per-stream Referer — required for some Miruro CDNs (e.g., uwucdn.top needs kwik.cx) */
  streamReferer?: string;
  allSources?: MiruroDirectSource[];
  triedProviders: string[];
} | null> {
  // Step 1: Get episode list to find pipe episode IDs per provider
  const data = await fetchRawEpisodes(anilistId);
  if (!data?.providers) {
    console.error("[MiruroDirect] getPlayableSource: no providers data");
    return null;
  }

  const PRIORITY = ["kiwi", "pewe", "bee", "bonk", "bun", "ally", "nun", "twin", "cog", "moo", "hop", "telli"];
  const triedProviders: string[] = [];

  // Build list of (provider, episodeId) pairs to try
  const candidates: Array<{ provider: string; episodeId: string }> = [];
  for (const provName of PRIORITY) {
    const p = data.providers[provName];
    if (!p?.episodes) continue;
    const eps = category === "dub" ? p.episodes.dub : p.episodes.sub;
    if (!eps?.length) continue;
    const ep = eps.find(e => Number(e.number) === Number(episodeNum));
    if (ep?.id) {
      candidates.push({ provider: provName, episodeId: ep.id });
    }
  }
  // Also try providers not in priority list
  for (const [provName, p] of Object.entries(data.providers)) {
    if (!p?.episodes) continue;
    const eps = category === "dub" ? p.episodes.dub : p.episodes.sub;
    if (!eps?.length) continue;
    const ep = eps?.find(e => Number(e.number) === Number(episodeNum));
    if (ep?.id && !candidates.find(c => c.provider === provName)) {
      candidates.push({ provider: provName, episodeId: ep.id });
    }
  }

  console.log(`[MiruroDirect] getPlayableSource: ${candidates.length} candidates for anilistId=${anilistId} ep=${episodeNum} cat=${category}`);
  if (candidates.length === 0) {
    return null;
  }

  // Step 2: Try each candidate — first m3u8 wins
  for (const { provider, episodeId } of candidates) {
    triedProviders.push(provider);
    try {
      const result = await getSources(episodeId, provider, anilistId, category);
      // Miruro returns streams as the primary key (some providers use sources)
      const allStreams = (result?.streams || result?.sources || []) as MiruroDirectSource[];
      if (!allStreams.length) {
        console.log(`[MiruroDirect] ${provider}: no streams returned`);
        continue;
      }

      // Find first HLS m3u8 stream, or fallback to MP4 (skip embeds)
      const m3u8Streams = allStreams.filter(s =>
        s.url && (s.isM3U8 || s.url.includes(".m3u8") || s.type === "hls")
      );
      const mp4Streams = allStreams.filter(s =>
        s.url && (s.url.includes(".mp4") || s.type === "mp4" || (!s.isM3U8 && !s.url.includes(".m3u8")))
      );
      if (m3u8Streams.length === 0 && mp4Streams.length === 0) {
        console.log(`[MiruroDirect] ${provider}: no playable streams (have: ${allStreams.map(s => s.type).join(",")})`);
        continue;
      }

      const isHLS = m3u8Streams.length > 0;
      // Pick the first active (or first if none marked active)
      const picked = isHLS
        ? (m3u8Streams.find(s => s.isActive) || m3u8Streams[0])
        : (mp4Streams.find(s => s.isActive) || mp4Streams[0]);
      console.log(`[MiruroDirect] ${provider}: FOUND ${isHLS ? 'm3u8' : 'mp4'}! quality=${picked.quality}, referer=${picked.referer || "(none)"}, url=${picked.url.slice(0, 80)}`);

      // Build subtitles from tracks
      const subtitles: Array<{ url: string; lang: string; language?: string }> = [];
      const rawTracks: any[] = (result?.tracks || result?.subtitles || []) as any[];
      for (const t of rawTracks) {
        if (!t?.url) continue;
        subtitles.push({
          url: t.url,
          lang: t.lang || "en",
          language: t.label || t.language || t.lang || "English",
        });
      }

      // Build headers — IMPORTANT: use per-stream referer if provided
      // uwucdn.top (kiwi/uwu) requires Referer: https://kwik.cx/
      const streamReferer = picked.referer || "https://www.miruro.tv/";
      const headers: Record<string, string> = {
        Referer: streamReferer,
        "User-Agent": HEADERS["User-Agent"],
      };
      // Some CDNs need Origin too
      if (streamReferer && streamReferer !== "https://www.miruro.tv/") {
        try {
          const origin = new URL(streamReferer).origin;
          headers["Origin"] = origin;
        } catch {}
      } else {
        headers["Origin"] = "https://www.miruro.tv";
      }

      return {
        url: picked.url,
        quality: picked.quality || "auto",
        isM3U8: isHLS,
        provider,
        subtitles,
        intro: result?.intro || undefined,
        outro: result?.outro || undefined,
        headers,
        streamReferer,
        allSources: allStreams,
        triedProviders,
      };
    } catch (e) {
      console.error(`[MiruroDirect] getPlayableSource: ${provider} failed:`, e);
      continue;
    }
  }

  console.error(`[MiruroDirect] All ${triedProviders.length} providers tried, none yielded a playable source`);
  return null;
}
