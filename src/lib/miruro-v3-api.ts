/**
 * Miruro V3 API Client — uses the NEW api.luffytv.online backend.
 *
 * This is the official Miruro API v3.0 hosted at https://api.luffytv.online/
 * It provides a 3-step streaming flow:
 *   1. GET /episodes/{anilist_id} → episode lists per provider (sub/dub)
 *   2. GET /watch/{provider}/{anilistId}/{category}/{slug} → stream URLs
 *   3. Play the HLS stream through our worker proxy
 *
 * IMPORTANT:
 *   - Sub/dub are SEPARATE episode lists per provider. When requesting dub,
 *     you MUST check that the provider has dub episodes — not all do.
 *   - Episode IDs follow the format: "watch/{provider}/{anilistId}/{category}/{slug}"
 *     These IDs are used directly as the watch URL path.
 *   - Stream URLs (vault-XX.uwucdn.top, kwik.cx) require specific Referer
 *     headers. We wrap them through our Cloudflare Worker proxy.
 *   - The API has Cloudflare protection on the pipe endpoint. Do NOT deploy
 *     on Vercel — use a VPS with residential IP.
 */

import { wrapM3u8Url, wrapM3u8UrlWithReferer, wrapStreamUrl } from "./proxy";

// ─── Configuration ────────────────────────────────────────────────────────
const MIRURO_V3_BASE = "https://api.luffytv.online";

// Provider priority order (best quality/reliability first)
const PROVIDER_PRIORITY = [
  "kiwi", "pewe", "bee", "bonk", "ally", "moo", "hop", "telli",
  "bun", "nun", "twin", "cog",
];

// ─── Types ────────────────────────────────────────────────────────────────

export interface MiruroV3Episode {
  id: string;            // e.g., "watch/kiwi/20/sub/animepahe-1"
  number: number;
  title?: string;
  image?: string;
  airDate?: string;
  duration?: number;
  audio?: "sub" | "dub";
  filler?: boolean;
  uncensored?: boolean;
  fillerType?: string;
  description?: string;
}

export interface MiruroV3ProviderData {
  episodes: {
    sub: MiruroV3Episode[];
    dub: MiruroV3Episode[];
  };
  meta?: { title?: string };
}

export interface MiruroV3EpisodesResponse {
  mappings?: Record<string, any>;
  providers: Record<string, MiruroV3ProviderData>;
}

export interface MiruroV3Stream {
  url: string;
  type?: "hls" | "embed" | "mp4" | string;
  quality?: string;
  isM3U8?: boolean;
  referer?: string;
  resolution?: { width?: number; height?: number };
  codec?: string;
  audio?: string;
  fansub?: string;
  isActive?: boolean;
}

export interface MiruroV3WatchResponse {
  streams?: MiruroV3Stream[];
  sources?: MiruroV3Stream[];  // Some providers use "sources" key
  subtitles?: Array<{ file?: string; url?: string; label?: string; lang?: string }>;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  download?: any;
}

export interface MiruroV3ServerResult {
  id: string;
  name: string;
  provider: string;
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  hardsub: boolean;
  priority: number;
  subtitleTracks?: Array<{ url: string; lang: string; label: string }>;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
}

// ─── API Functions ────────────────────────────────────────────────────────

/**
 * Fetch episodes for an anime from the Miruro V3 API.
 * Returns ALL providers with their sub/dub episode lists.
 */
export async function fetchV3Episodes(anilistId: number): Promise<MiruroV3EpisodesResponse | null> {
  try {
    const url = `${MIRURO_V3_BASE}/episodes/${anilistId}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[MiruroV3] episodes HTTP ${res.status} for anilistId=${anilistId}`);
      return null;
    }
    return await res.json();
  } catch (e: any) {
    console.error(`[MiruroV3] fetchV3Episodes failed:`, e?.message || e);
    return null;
  }
}

/**
 * Fetch stream data for a specific episode from the Miruro V3 API.
 * Uses the episode ID from the episodes response directly.
 *
 * The episode ID format is: "watch/{provider}/{anilistId}/{category}/{slug}"
 * We use this as the URL path directly.
 */
export async function fetchV3Watch(episodeId: string): Promise<MiruroV3WatchResponse | null> {
  try {
    // The episode ID IS the watch path (e.g., "watch/kiwi/20/sub/animepahe-1")
    const url = `${MIRURO_V3_BASE}/${episodeId}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://www.miruro.tv/",
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[MiruroV3] watch HTTP ${res.status} for episodeId=${episodeId}`);
      return null;
    }
    return await res.json();
  } catch (e: any) {
    console.error(`[MiruroV3] fetchV3Watch failed:`, e?.message || e);
    return null;
  }
}

/**
 * Determine the correct Referer for a Miruro CDN URL.
 * This is CRITICAL — many CDNs return 403 without the right Referer.
 *
 * uwucdn.top / owocdn.top → kwik.cx (AnimePahe CDNs)
 * kwik.cx → kwik.cx (self-referer)
 * Other Miruro CDNs → www.miruro.tv
 */
function getMiruroReferer(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    // AnimePahe CDNs — vault-XX.uwucdn.top / vault-XX.owocdn.top
    if (hostname.includes("uwucdn") || hostname.includes("owocdn")) return "https://kwik.cx/";
    // Kwik player — self-referer
    if (hostname.includes("kwik")) return "https://kwik.cx/";
    // krussdomi — self-referer
    if (hostname.includes("krussdomi")) return "https://krussdomi.com/";
    // Default miruro referer
    return "https://www.miruro.tv/";
  } catch {
    return "https://www.miruro.tv/";
  }
}

/**
 * Wrap a stream URL through our Cloudflare Worker proxy with the correct
 * Referer for the CDN. HLS (m3u8) streams use wrapM3u8UrlWithReferer
 * so segment URLs are also proxied. MP4/embed use wrapStreamUrl.
 */
function wrapMiruroStream(rawUrl: string, streamType: string, streamReferer?: string): string {
  if (!rawUrl) return "";
  // Already proxied? Skip
  if (rawUrl.includes("/p/") || rawUrl.includes("/api/hls-proxy") || rawUrl.includes("cdn-eu.1ani.me")) {
    return rawUrl;
  }

  const referer = streamReferer || getMiruroReferer(rawUrl);

  // HLS m3u8 — wrap through worker proxy with referer
  if (streamType === "hls" || rawUrl.includes(".m3u8")) {
    return wrapM3u8UrlWithReferer(rawUrl, referer);
  }

  // Embed/iframe — return as-is (iframe loads directly)
  if (streamType === "embed" || streamType === "iframe") {
    return rawUrl;
  }

  // MP4 or other — wrap through stream proxy
  return wrapStreamUrl(rawUrl);
}

/**
 * Build all available Miruro V3 servers for a given anime + episode.
 *
 * This is the main function called by the separate miruro-v3 route.
 * It:
 *   1. Fetches ALL providers + episodes from api.luffytv.online
 *   2. For each provider that has this episode (sub and/or dub):
 *      a. Fetches the stream data
 *      b. Wraps URLs through our proxy
 *      c. Builds a server result
 *   3. Returns all server results sorted by priority
 *
 * CAREFUL with sub/dub:
 *   - We check each provider's sub AND dub episode lists SEPARATELY
 *   - A provider may have sub but not dub (e.g., kiwi only has sub for many anime)
 *   - We add SEPARATE server entries for sub and dub
 *   - Dub entries are tagged with "(Dub)" in the name
 */
export async function getMiruroV3Servers(
  anilistId: number,
  episodeNum: number,
  options?: {
    sub?: boolean;
    dub?: boolean;
    timeoutMs?: number;
    maxProviders?: number;
  }
): Promise<MiruroV3ServerResult[]> {
  const includeSub = options?.sub !== false;
  const includeDub = options?.dub !== false;
  const timeoutMs = options?.timeoutMs || 12000;
  const maxProviders = options?.maxProviders || 6;

  // Step 1: Fetch episodes to get all providers
  const episodesData = await fetchV3Episodes(anilistId);
  if (!episodesData?.providers) {
    console.error("[MiruroV3] No providers data returned");
    return [];
  }

  const providers = episodesData.providers;
  const availableProviders = Object.keys(providers);

  // Sort providers by priority
  const sortedProviders = availableProviders.sort((a, b) => {
    const ai = PROVIDER_PRIORITY.indexOf(a);
    const bi = PROVIDER_PRIORITY.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // Take top N providers to avoid too many parallel requests
  const topProviders = sortedProviders.slice(0, maxProviders);

  console.log(`[MiruroV3] anilistId=${anilistId} ep=${episodeNum}: ${availableProviders.length} providers, using top ${topProviders.length}: ${topProviders.join(", ")}`);

  // Step 2: For each provider, check if it has this episode (sub and/or dub)
  // and fetch the stream data
  const results: MiruroV3ServerResult[] = [];

  const fetchPromises = topProviders.map(async (providerName, provIdx) => {
    const providerData = providers[providerName];
    if (!providerData?.episodes) return;

    // ── SUB episodes ──
    if (includeSub) {
      const subEp = providerData.episodes.sub?.find(
        ep => Number(ep.number) === Number(episodeNum)
      );
      if (subEp?.id) {
        try {
          const watchData = await withTimeout(
            fetchV3Watch(subEp.id),
            timeoutMs,
            null,
          );
          if (watchData) {
            const servers = buildServersFromWatch(
              watchData, providerName, "sub", provIdx, anilistId
            );
            results.push(...servers);
          }
        } catch (e: any) {
          console.error(`[MiruroV3] ${providerName}/sub failed:`, e?.message || e);
        }
      }
    }

    // ── DUB episodes (SEPARATE — check dub list specifically) ──
    if (includeDub) {
      const dubEp = providerData.episodes.dub?.find(
        ep => Number(ep.number) === Number(episodeNum)
      );
      if (dubEp?.id) {
        try {
          const watchData = await withTimeout(
            fetchV3Watch(dubEp.id),
            timeoutMs,
            null,
          );
          if (watchData) {
            const servers = buildServersFromWatch(
              watchData, providerName, "dub", provIdx, anilistId
            );
            results.push(...servers);
          }
        } catch (e: any) {
          console.error(`[MiruroV3] ${providerName}/dub failed:`, e?.message || e);
        }
      }
    }
  });

  // Run all provider fetches in parallel
  await Promise.allSettled(fetchPromises);

  // Sort by priority
  results.sort((a, b) => a.priority - b.priority);

  console.log(`[MiruroV3] anilistId=${anilistId} ep=${episodeNum}: ${results.length} servers found`);
  return results;
}

/**
 * Build server results from a watch response.
 * Separates HLS streams from embeds, wraps URLs through proxy.
 */
function buildServersFromWatch(
  watchData: MiruroV3WatchResponse,
  providerName: string,
  category: "sub" | "dub",
  providerIdx: number,
  anilistId: number,
): MiruroV3ServerResult[] {
  const allStreams = watchData.streams || watchData.sources || [];
  if (!allStreams.length) return [];

  const servers: MiruroV3ServerResult[] = [];
  const isDub = category === "dub";
  const nameTag = isDub ? " (Dub)" : "";
  const displayName = providerName.charAt(0).toUpperCase() + providerName.slice(1);

  // Separate HLS and embed streams
  const hlsStreams = allStreams.filter(s =>
    s.url && (s.type === "hls" || s.url.includes(".m3u8") || s.isM3U8)
  );
  const embedStreams = allStreams.filter(s =>
    s.url && (s.type === "embed" || s.type === "iframe")
  );
  const mp4Streams = allStreams.filter(s =>
    s.url && s.type === "mp4" && !s.url.includes(".m3u8")
  );

  // Build subtitle tracks
  const subtitleTracks: Array<{ url: string; lang: string; label: string }> = [];
  for (const sub of watchData.subtitles || []) {
    const subUrl = sub.url || sub.file || "";
    if (!subUrl) continue;
    // Wrap subtitle URL through our proxy too
    const wrappedUrl = subUrl.startsWith("http")
      ? wrapStreamUrl(subUrl)
      : subUrl;
    subtitleTracks.push({
      url: wrappedUrl,
      lang: sub.lang || "en",
      label: sub.label || sub.lang || "English",
    });
  }

  // Add HLS servers (these are the priority — m3u8 streams)
  if (hlsStreams.length > 0) {
    // Pick best stream (prefer active, then highest quality)
    const activeStream = hlsStreams.find(s => s.isActive) || hlsStreams[0];
    const referer = activeStream.referer || getMiruroReferer(activeStream.url);
    const proxyUrl = wrapMiruroStream(activeStream.url, "hls", referer);

    servers.push({
      id: `miruro-v3:${providerName}:${category}`,
      name: `Nexus ${displayName} ${activeStream.quality || "Auto"}${nameTag}`,
      provider: providerName,
      type: category,
      quality: activeStream.quality || "1080p",
      streamUrl: proxyUrl,
      isM3U8: true,
      isMP4: false,
      isEmbed: false,
      hardsub: false,
      priority: providerIdx * 2 + (isDub ? 1 : 0),
      subtitleTracks: subtitleTracks.length > 0 ? subtitleTracks : undefined,
      intro: watchData.intro || null,
      outro: watchData.outro || null,
    });

    // If there are multiple quality variants, add them as separate servers
    const otherHls = hlsStreams.filter(s => s !== activeStream);
    for (let i = 0; i < Math.min(otherHls.length, 2); i++) {
      const s = otherHls[i];
      const ref = s.referer || getMiruroReferer(s.url);
      servers.push({
        id: `miruro-v3:${providerName}:${category}:${s.quality || i}`,
        name: `Nexus ${displayName} ${s.quality || "Alt"}${nameTag}`,
        provider: providerName,
        type: category,
        quality: s.quality || "auto",
        streamUrl: wrapMiruroStream(s.url, "hls", ref),
        isM3U8: true,
        isMP4: false,
        isEmbed: false,
        hardsub: false,
        priority: providerIdx * 2 + (isDub ? 1 : 0) + 0.1 * (i + 1),
        subtitleTracks: subtitleTracks.length > 0 ? subtitleTracks : undefined,
        intro: watchData.intro || null,
        outro: watchData.outro || null,
      });
    }
  }

  // Add embed servers (lower priority — iframe embeds)
  if (embedStreams.length > 0 && hlsStreams.length === 0) {
    const embed = embedStreams[0];
    servers.push({
      id: `miruro-v3:${providerName}:${category}:embed`,
      name: `Nexus ${displayName} (Embed)${nameTag}`,
      provider: providerName,
      type: category,
      quality: embed.quality || "SD",
      streamUrl: embed.url, // Embeds are loaded as iframes, no proxy
      isM3U8: false,
      isMP4: false,
      isEmbed: true,
      hardsub: false,
      priority: providerIdx * 2 + (isDub ? 1 : 0) + 0.5,
      intro: watchData.intro || null,
      outro: watchData.outro || null,
    });
  }

  // Add MP4 servers (fallback)
  if (mp4Streams.length > 0 && hlsStreams.length === 0) {
    const mp4 = mp4Streams[0];
    servers.push({
      id: `miruro-v3:${providerName}:${category}:mp4`,
      name: `Nexus ${displayName} (MP4)${nameTag}`,
      provider: providerName,
      type: category,
      quality: mp4.quality || "720p",
      streamUrl: wrapStreamUrl(mp4.url),
      isM3U8: false,
      isMP4: true,
      isEmbed: false,
      hardsub: false,
      priority: providerIdx * 2 + (isDub ? 1 : 0) + 0.6,
      intro: watchData.intro || null,
      outro: watchData.outro || null,
    });
  }

  return servers;
}

/**
 * Get a SINGLE playable source for a specific provider + episode.
 * Used by the embed-servers generateUrl for quick stream loading.
 */
export async function getMiruroV3SingleSource(
  anilistId: number,
  episodeNum: number,
  category: "sub" | "dub",
  provider: string,
): Promise<{
  streamUrl: string;
  isM3U8: boolean;
  quality: string;
  provider: string;
  subtitles: Array<{ url: string; lang: string; label: string }>;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
} | null> {
  // Step 1: Fetch episodes to find the episode ID for this provider
  const episodesData = await fetchV3Episodes(anilistId);
  if (!episodesData?.providers?.[provider]?.episodes) return null;

  const eps = category === "dub"
    ? episodesData.providers[provider].episodes.dub
    : episodesData.providers[provider].episodes.sub;

  const ep = eps?.find(e => Number(e.number) === Number(episodeNum));
  if (!ep?.id) return null;

  // Step 2: Fetch watch data
  const watchData = await fetchV3Watch(ep.id);
  if (!watchData) return null;

  const allStreams = watchData.streams || watchData.sources || [];
  if (!allStreams.length) return null;

  // Find best stream (HLS > MP4 > embed)
  const hlsStreams = allStreams.filter(s =>
    s.url && (s.type === "hls" || s.url.includes(".m3u8") || s.isM3U8)
  );

  const picked = hlsStreams.length > 0
    ? (hlsStreams.find(s => s.isActive) || hlsStreams[0])
    : allStreams.find(s => s.url);

  if (!picked?.url) return null;

  // Wrap through proxy
  const referer = picked.referer || getMiruroReferer(picked.url);
  const isHLS = picked.type === "hls" || picked.url.includes(".m3u8") || !!picked.isM3U8;
  const proxyUrl = isHLS
    ? wrapM3u8UrlWithReferer(picked.url, referer)
    : wrapStreamUrl(picked.url);

  // Build subtitles
  const subtitles: Array<{ url: string; lang: string; label: string }> = [];
  for (const sub of watchData.subtitles || []) {
    const subUrl = sub.url || sub.file || "";
    if (!subUrl) continue;
    subtitles.push({
      url: subUrl.startsWith("http") ? wrapStreamUrl(subUrl) : subUrl,
      lang: sub.lang || "en",
      label: sub.label || sub.lang || "English",
    });
  }

  return {
    streamUrl: proxyUrl,
    isM3U8: isHLS,
    quality: picked.quality || "auto",
    provider,
    subtitles,
    intro: watchData.intro || null,
    outro: watchData.outro || null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(r => setTimeout(() => r(fallback), ms)),
  ]);
}

/**
 * Get the list of available providers for an anime (without fetching streams).
 * Useful for UI to show available servers before the user clicks play.
 */
export async function getMiruroV3Providers(
  anilistId: number,
  episodeNum: number,
): Promise<Array<{
  provider: string;
  hasSub: boolean;
  hasDub: boolean;
  subEpisodeId?: string;
  dubEpisodeId?: string;
}>> {
  const episodesData = await fetchV3Episodes(anilistId);
  if (!episodesData?.providers) return [];

  const result: Array<{
    provider: string;
    hasSub: boolean;
    hasDub: boolean;
    subEpisodeId?: string;
    dubEpisodeId?: string;
  }> = [];

  for (const [name, data] of Object.entries(episodesData.providers)) {
    if (!data?.episodes) continue;

    const subEp = data.episodes.sub?.find(ep => Number(ep.number) === Number(episodeNum));
    const dubEp = data.episodes.dub?.find(ep => Number(ep.number) === Number(episodeNum));

    if (subEp || dubEp) {
      result.push({
        provider: name,
        hasSub: !!subEp,
        hasDub: !!dubEp,
        subEpisodeId: subEp?.id,
        dubEpisodeId: dubEp?.id,
      });
    }
  }

  // Sort by priority
  result.sort((a, b) => {
    const ai = PROVIDER_PRIORITY.indexOf(a.provider);
    const bi = PROVIDER_PRIORITY.indexOf(b.provider);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return result;
}
