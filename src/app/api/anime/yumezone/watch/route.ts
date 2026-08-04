import { NextRequest, NextResponse } from "next/server";
import {
  miruroEpisodes,
  miruroWatch,
  miruroWatchProvider,
  getEpisodeSlugForProvider,
  getAvailableProvidersForEpisode,
  type MiruroProviderEpisodes,
} from "@/lib/miruro-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Proxy endpoints (matching YumeZone source) ──────────────────────────
const CDN_PROXY_URL = process.env.CDN_PROXY_URL || "https://cdn-eu.1ani.me/proxy/m3u8";
const WORKER_BASE = process.env.WORKER_URL || "";

// Providers that must use kiwi worker proxy (/p/ Base64 route)
const WORKER_PROVIDERS = new Set([
  "kiwi", "animex", "ax", "ax-uwu", "ax-mochi", "ax-wave", "ax-zaza",
  "ax-yuki", "ax-zen", "ax-beep", "uwu", "mochi", "wave", "zaza", "yuki", "zen",
]);

// Providers that must always use CDN-EU (never kiwi worker)
const CDN_ONLY_PROVIDERS = new Set(["arc", "jet", "zoro", "miruro"]);

// Provider priority matching YumeZone
const PROVIDER_PRIORITY = [
  "zenith", "kiwi", "ax-mimi", "ax-wave", "ax-shiro", "ax-yuki", "ax-zen", "ax-beep",
  "bee", "miku", "zoro", "arc", "jet",
];

/**
 * GET /api/anime/yumezone/watch?anilistId=1535&episode=1&provider=kiwi&type=sub
 *
 * Properly maps AniList ID → Miruro episode slug → m3u8/HLS stream with correct headers.
 *
 * Flow (matching YumeZone):
 * 1. Fetch episodes from Miruro API → get providers_map
 * 2. Find episode ID for requested provider + episode number + category
 * 3. Fetch stream data from Miruro: /watch/{provider}/{anilistId}/{category}/{slug}
 * 4. Route m3u8 URLs through correct proxy (cdn-eu for arc/jet/zoro, kiwi worker for kiwi/ax-*)
 * 5. Return structured video data with HLS sources, embed sources, subtitles, intro/outro
 */
export async function GET(req: NextRequest) {
  const anilistIdStr = req.nextUrl.searchParams.get("anilistId");
  const episodeStr = req.nextUrl.searchParams.get("episode") || "1";
  const provider = req.nextUrl.searchParams.get("provider") || "";
  const translationType = (req.nextUrl.searchParams.get("type") || "sub") as "sub" | "dub";

  if (!anilistIdStr) {
    return NextResponse.json({ error: "anilistId required" }, { status: 400 });
  }

  const anilistId = parseInt(anilistIdStr);
  const episodeNum = parseFloat(episodeStr);

  if (isNaN(anilistId)) {
    return NextResponse.json({ error: "Invalid anilistId" }, { status: 400 });
  }

  try {
    // Step 1: Fetch episodes to get providers_map
    const epData = await miruroEpisodes(anilistId);
    const providersMap = epData.providersMap || {};

    // Step 2: Skip Zoro/Megaplay — embeds are unreliable (frequent 410 Gone errors)
    // Instead, try the next available HLS provider

    // Step 3: Determine which provider to use
    let activeProvider = provider;
    let episodeSlug: string | null = null;

    // Try the requested provider first
    if (activeProvider && providersMap[activeProvider]) {
      episodeSlug = getEpisodeSlugForProvider(providersMap, activeProvider, episodeNum, translationType);
    }

    // If no slug found, try providers in priority order (YumeZone's approach)
    if (!episodeSlug) {
      const availableProviders = getAvailableProvidersForEpisode(providersMap, episodeNum, translationType);

      for (const candidateProvider of availableProviders) {
        const slug = getEpisodeSlugForProvider(providersMap, candidateProvider, episodeNum, translationType);
        if (slug) {
          activeProvider = candidateProvider;
          episodeSlug = slug;
          break;
        }
      }
    }

    // If still no slug, try all providers
    if (!episodeSlug) {
      for (const [provName, provData] of Object.entries(providersMap)) {
        if (!provData?.episodes) continue;
        const eps = translationType === "dub" ? provData.episodes.dub : provData.episodes.sub;
        const ep = eps.find(e => e.number === episodeNum);
        if (ep) {
          activeProvider = provName;
          episodeSlug = ep.slug || ep.id || String(ep.number);
          break;
        }
      }
    }

    // Last resort: use episode number as slug
    if (!episodeSlug) {
      episodeSlug = String(episodeNum);
      if (!activeProvider) activeProvider = "kiwi";
    }

    // Positional fallback for 0-based numbering (YumeZone's _resolve_episode Pass 2)
    if (!episodeSlug || episodeSlug === String(episodeNum)) {
      // Try exact float match first
      const exactMatch = findExactEpisode(providersMap, activeProvider, episodeNum, translationType);
      if (exactMatch) {
        episodeSlug = exactMatch;
      }
    }

    console.log(`[YumeZone Watch] anilistId=${anilistId} ep=${episodeNum} provider=${activeProvider} slug=${episodeSlug}`);

    // Step 4: Fetch stream data from Miruro watch API
    let result: Awaited<ReturnType<typeof miruroWatchProvider>> = null;
    let triedProviders: string[] = [activeProvider];

    try {
      result = await miruroWatchProvider(activeProvider, anilistId, translationType, episodeSlug);
    } catch (e) {
      console.log(`[YumeZone Watch] Provider ${activeProvider} failed:`, e);
    }

    // Auto-fallback to other providers if primary fails — race top 3 in parallel for speed
    if (!result || result.sources.length === 0) {
      const allProviders = getAvailableProvidersForEpisode(providersMap, episodeNum, translationType)
        .filter(p => p !== activeProvider);

      // Race top 3 fallback providers simultaneously
      const topFallbacks = allProviders.slice(0, 3);
      if (topFallbacks.length > 0) {
        const raceResults = await Promise.allSettled(
          topFallbacks.map(async (fallbackProvider) => {
            const fallbackSlug = getEpisodeSlugForProvider(providersMap, fallbackProvider, episodeNum, translationType);
            if (!fallbackSlug) throw new Error(`No slug for ${fallbackProvider}`);
            triedProviders.push(fallbackProvider);
            const fallbackResult = await miruroWatchProvider(fallbackProvider, anilistId, translationType, fallbackSlug);
            if (!fallbackResult || fallbackResult.sources.length === 0) throw new Error(`No sources from ${fallbackProvider}`);
            return { result: fallbackResult, provider: fallbackProvider, slug: fallbackSlug };
          })
        );

        for (const raceResult of raceResults) {
          if (raceResult.status === "fulfilled") {
            const { result: fbResult, provider: fbProvider, slug: fbSlug } = raceResult.value;
            result = fbResult;
            activeProvider = fbProvider;
            episodeSlug = fbSlug;
            break;
          }
        }
      }
    }

    if (!result || result.sources.length === 0) {
      // All providers failed — return error instead of unreliable Megaplay embed
      // (Megaplay embeds frequently return 410 Gone)
      return NextResponse.json({
        error: "No working stream found for this episode. Try a different server.",
        video_link: "",
        source_type: "hls",
        hls_sources: [],
        embed_sources: [],
        video_sources: [],
        subtitle_tracks: [],
        intro: null,
        outro: null,
        provider: activeProvider,
        available_qualities: [],
        tried_providers: triedProviders,
        all_providers: Object.keys(providersMap),
        _fallback: true,
      }, { status: 404 });
    }

    // Step 5: Separate sources into HLS and embed, route through proxy (YumeZone logic)
    const hlsSources: Array<{
      url: string; quality: string; label: string; isM3U8: boolean;
      width?: number; height?: number; codec?: string; fansub?: string;
    }> = [];
    const embedSources: Array<{
      url: string; quality: string; label: string; type: string;
    }> = [];

    for (const source of result.sources) {
      const rawUrl = source.url || "";
      if (!rawUrl) continue;

      // Megaplay domain mapping fix (from YumeZone source)
      let url = rawUrl;
      if (url.includes("megaup.nl")) {
        url = url.replace("megaup.nl", "megaplay.buzz");
      }

      // Route through correct proxy based on provider type (YumeZone _route_stream_proxy)
      const sourceHeaders = (source as any).headers || result.headers;
      const routedUrl = routeStreamProxy(url, activeProvider, sourceHeaders);
      const streamType = (source as any).type || "";
      const isM3U8 = source.isM3U8 || url.includes(".m3u8") || url.includes("/proxy/m3u8") || url.includes("/p/");

      if (streamType === "embed") {
        embedSources.push({
          url: routedUrl,
          quality: source.quality || "SD",
          label: (source as any).sourceName || source.quality || "Embed",
          type: "embed",
        });
      } else if ((source as any).sourceType === "external" || streamType === "iframe") {
        embedSources.push({
          url: routedUrl,
          quality: source.quality || "SD",
          label: (source as any).sourceName || source.quality || "Embed",
          type: "embed",
        });
      } else {
        // Default: treat as HLS/m3u8
        hlsSources.push({
          url: routedUrl,
          quality: source.quality || "Auto",
          label: source.quality || "Auto",
          isM3U8: true,
          width: (source as any).width || 0,
          height: (source as any).height || 0,
          codec: (source as any).codec || "",
          fansub: (source as any).fansub || "",
        });
      }
    }

    // Filter sources: only show > 480p (matching YumeZone)
    const filteredHls = hlsSources.filter(s =>
      (s.height ?? 0) > 700 || ((s.height ?? 0) === 0 && !s.quality.toLowerCase().includes("480") && !s.quality.toLowerCase().includes("360"))
    );

    // Route subtitle URLs through CDN proxy (YumeZone: subtitles always cdn-eu)
    const subtitleTracks = (result.subtitles || []).map(sub => ({
      url: routeCdnProxy(sub.url, { referer: "https://miruro.tv/" }),
      label: sub.lang || sub.language || "English",
      kind: "subtitles" as const,
    }));

    // Sort subtitles: English first, thumbnails last (YumeZone sort_subtitle_priority)
    subtitleTracks.sort((a, b) => {
      const la = a.label.toLowerCase();
      const lb = b.label.toLowerCase();
      if (la.includes("thumbnail")) return 1;
      if (lb.includes("thumbnail")) return -1;
      if (la.includes("english") || la.includes("eng")) return -1;
      if (lb.includes("english") || lb.includes("eng")) return 1;
      return 0;
    });

    // Determine source type
    let sourceType: "hls" | "embed" | "mp4" = "hls";
    if (filteredHls.length === 0 && embedSources.length > 0) sourceType = "embed";
    else if (filteredHls.length === 0 && embedSources.length === 0) sourceType = "mp4";

    // Determine the primary video link
    let videoLink = "";
    if (sourceType === "embed" && embedSources.length > 0) {
      videoLink = embedSources[0].url;
    } else if (filteredHls.length > 0) {
      // Prefer the "active" stream if marked, otherwise first
      const activeStream = filteredHls.find(s => (s as any).isActive) || filteredHls[0];
      videoLink = activeStream.url;
    }

    // Use intro/outro from current provider result only (skip scavenging — too slow)
    let intro = result.intro || null;
    let outro = result.outro || null;

    return NextResponse.json({
      video_link: videoLink,
      source_type: sourceType,
      hls_sources: filteredHls.length > 0 ? filteredHls : hlsSources,
      embed_sources: embedSources,
      video_sources: [],
      subtitle_tracks: subtitleTracks,
      intro,
      outro,
      provider: activeProvider,
      available_qualities: (filteredHls.length > 0 ? filteredHls : hlsSources).map(s => s.quality),
      tried_providers: triedProviders,
      all_providers: Object.keys(providersMap),
      _debug: { anilistId, episodeNum, translationType, episodeSlug, activeProvider },
    });
  } catch (err) {
    console.error("[YumeZone Watch] Error:", err);
    return NextResponse.json({
      error: "Watch failed. Please try again.",
      _debug: { anilistId, episodeNum, translationType },
    }, { status: 500 });
  }
}

/**
 * Find exact episode slug by float matching (YumeZone's _resolve_episode Pass 1)
 */
function findExactEpisode(
  providersMap: Record<string, MiruroProviderEpisodes>,
  providerName: string,
  episodeNum: number,
  category: "sub" | "dub"
): string | null {
  const providerData = providersMap[providerName];
  if (!providerData?.episodes) return null;

  const eps = category === "dub" ? providerData.episodes.dub : providerData.episodes.sub;
  const ep = eps.find(e => parseFloat(String(e.number)) === episodeNum);
  if (ep) return ep.slug || ep.id || null;

  // Positional fallback (0-based indexing)
  const sortedEps = [...eps].sort((a, b) => a.number - b.number);
  const idx = Math.floor(episodeNum) - 1;
  if (idx >= 0 && idx < sortedEps.length) {
    return sortedEps[idx].slug || sortedEps[idx].id || null;
  }

  return null;
}

/**
 * Route stream URLs to the correct proxy (YumeZone _route_stream_proxy logic).
 *
 * Rules:
 *   - kiwi / animex / ax-* → kiwi worker proxy (/p/ Base64 route)
 *   - arc / jet / zoro / miruro → cdn-eu only
 *   - zenith → no proxy (direct URL)
 *   - subtitles → cdn-eu only
 *   - everything else → cdn-eu only
 */
function routeStreamProxy(url: string, provider: string, headers?: Record<string, string>): string {
  if (!url || isAlreadyProxied(url)) return url;

  const providerNorm = (provider || "").toLowerCase();

  // Zenith: no proxy (direct URL)
  if (providerNorm === "zenith") return url;

  // CDN-only providers: arc, jet, zoro, miruro
  if (CDN_ONLY_PROVIDERS.has(providerNorm)) {
    return routeCdnProxy(url, headers);
  }

  // Kiwi / AnimeX family → kiwi worker proxy
  const isWorkerProvider =
    WORKER_PROVIDERS.has(providerNorm) ||
    providerNorm.startsWith("ax-") ||
    providerNorm.startsWith("animex");

  if (isWorkerProvider && WORKER_BASE) {
    const referer = headers?.referer || headers?.Referer || "";
    const finalReferer = referer || (providerNorm === "kiwi" ? "https://kwik.cx/" : "");
    return encodePayload(url, finalReferer);
  }

  // Default: CDN-EU proxy
  return routeCdnProxy(url, headers);
}

/**
 * Kiwi worker proxy encoding (/p/ Base64 route)
 * Format: WORKER_BASE/p/{base64(url\x00referer)}
 */
function encodePayload(url: string, referer: string): string {
  if (!url || isAlreadyProxied(url)) return url;
  try {
    const raw = `${url}\x00${referer || ""}`;
    const b64 = Buffer.from(raw, "utf-8").toString("base64url");
    return `${WORKER_BASE}/p/${b64}`;
  } catch {
    return url;
  }
}

/**
 * Route through CDN-EU proxy with optional headers
 * Format: https://cdn-eu.1ani.me/proxy/m3u8?url=...&headers={"referer":"..."}
 */
function routeCdnProxy(url: string, headers?: Record<string, string> | undefined): string {
  if (!url || isAlreadyProxied(url)) return url;
  try {
    const encodedUrl = encodeURIComponent(url);
    let proxyUrl = `${CDN_PROXY_URL}?url=${encodedUrl}`;

    if (headers && typeof headers === "object" && Object.keys(headers).length > 0) {
      const filteredHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(headers)) {
        if (v) filteredHeaders[k] = v;
      }
      if (Object.keys(filteredHeaders).length > 0) {
        proxyUrl += `&headers=${encodeURIComponent(JSON.stringify(filteredHeaders))}`;
      }
    }

    return proxyUrl;
  } catch {
    return url;
  }
}

function isAlreadyProxied(url: string): boolean {
  if (!url) return false;
  const workerBaseP = WORKER_BASE ? url.startsWith(WORKER_BASE + "/p/") : false;
  return (
    url.includes("cdn-eu.1ani.me/proxy/m3u8") ||
    url.includes("workers.dev/proxy/") ||
    url.includes("workers.dev/p/") ||
    url.includes("/api/hls-proxy") ||
    url.includes("/api/hls-resolve") ||
    workerBaseP
  );
}
