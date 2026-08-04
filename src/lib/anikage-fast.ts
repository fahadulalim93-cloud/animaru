/**
 * AniKage Fast — SKIP TIMES ONLY (no playable servers)
 *
 * AniKage's playable servers are duplicates of Senshi (same ninstream.com CDN).
 * We ONLY use AniKage for intro/outro skip times, which work for ALL anime.
 *
 * Optimized to be FAST:
 *   - Only fetches 1 provider (miko) instead of 5
 *   - ID resolution limited to 5 homepage IDs (not 20)
 *   - Total: max 3 Worker proxy requests (was 26)
 *   - 5s timeout on entire resolution
 *
 * The skip times are applied PERMANENTLY to all other servers.
 */

const ANIKAGE_BASE = "https://anikage.cc";
const WORKER_BASE =
  process.env.NEXT_PUBLIC_PROXY_BASE ||
  "https://luffytv-proxy.ggy892767.workers.dev";

// Import the skip-time validator. AniKage returns {start: 0, end: 0} when
// there's no data, and we filter that out here.
import { validateSkipTime } from "./episode-metadata";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://anikage.cc/",
  Origin: "https://anikage.cc",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

// Only fetch 1 provider for skip times (was 5 — miko is the fastest)
const SKIP_PROVIDER = "miko";

// ── Caches ──
const anikageIdCache = new Map<number, string | null>();
const skipCache = new Map<string, { intro: any; outro: any }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const cacheTimestamps = new Map<string, number>();

function isCacheFresh(key: string): boolean {
  const ts = cacheTimestamps.get(key);
  if (!ts) return false;
  return Date.now() - ts < CACHE_TTL;
}

// ── Types ──
export interface AniKageSkipResult {
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

export interface AniKageServer {
  name: string;
  provider: string;
  m3u8Url: string;
  type: "sub" | "dub";
  quality: string;
}

export interface AniKageResult {
  servers: AniKageServer[];
  anikageId: string;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

// ── Step 1: Resolve AniList ID → AniKage ID (FAST — max 5 info pages, not 20) ──
async function resolveAniKageId(
  anilistId: number,
  title: string,
): Promise<string | null> {
  const cacheKey = `anikage-id:${anilistId}`;
  if (anikageIdCache.has(anilistId) && isCacheFresh(cacheKey)) {
    return anikageIdCache.get(anilistId)!;
  }

  try {
    // Scrape the AniKage homepage through the Worker proxy
    const homeUrl = encodeURIComponent(`${ANIKAGE_BASE}/`);
    const ref = encodeURIComponent(`${ANIKAGE_BASE}/`);
    const proxyUrl = `${WORKER_BASE}/proxy?url=${homeUrl}&ref=${ref}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(proxyUrl, {
      headers: { "User-Agent": HEADERS["User-Agent"] },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      anikageIdCache.set(anilistId, null);
      cacheTimestamps.set(cacheKey, Date.now());
      return null;
    }

    const html = await res.text();

    // Extract anime IDs from links: /anime/info/{id} or /anime/watch/{id}
    const idPattern = /href="\/anime\/(?:info|watch)\/([^"]+)"/g;
    const matches = [...html.matchAll(idPattern)];
    const ids = [...new Set(matches.map((m) => m[1]))];

    if (ids.length === 0) {
      anikageIdCache.set(anilistId, null);
      cacheTimestamps.set(cacheKey, Date.now());
      return null;
    }

    // ONLY check first 5 IDs (was 20 — too slow)
    // This is a tradeoff: we might miss some anime, but it's 4x faster.
    let bestId: string | null = null;
    const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "");

    const checkPromises = ids.slice(0, 5).map(async (id) => {
      try {
        const infoUrl = encodeURIComponent(`${ANIKAGE_BASE}/anime/info/${id}`);
        const infoProxy = `${WORKER_BASE}/proxy?url=${infoUrl}&ref=${ref}`;
        const infoRes = await fetch(infoProxy, {
          headers: { "User-Agent": HEADERS["User-Agent"] },
          signal: AbortSignal.timeout(3000),
        });
        if (!infoRes.ok) return null;
        const infoHtml = await infoRes.text();

        // Extract AniList ID from the info page
        const anilistMatch = infoHtml.match(/anilist\.co\/anime\/(\d+)/);
        if (anilistMatch) {
          const pageAnilistId = parseInt(anilistMatch[1], 10);
          if (pageAnilistId === anilistId) {
            return { id, match: "anilist" };
          }
        }

        // Also match by title
        const pageTitleMatch = infoHtml.match(/<title>([^<]+)<\/title>/);
        if (pageTitleMatch) {
          const pageTitle = pageTitleMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, "");
          if (pageTitle.includes(titleSlug.slice(0, 15))) {
            return { id, match: "title" };
          }
        }
        return null;
      } catch { return null; }
    });

    const results = await Promise.all(checkPromises);
    const anilistMatch = results.find((r) => r?.match === "anilist");
    const titleMatch = results.find((r) => r?.match === "title");
    bestId = anilistMatch?.id || titleMatch?.id || null;

    if (bestId) {
      console.log(`[anikage-fast] AniList ${anilistId} → AniKage ${bestId}`);
    }

    anikageIdCache.set(anilistId, bestId);
    cacheTimestamps.set(cacheKey, Date.now());
    return bestId;
  } catch (err) {
    console.error(`[anikage-fast] resolveAniKageId error:`, err);
    anikageIdCache.set(anilistId, null);
    cacheTimestamps.set(cacheKey, Date.now());
    return null;
  }
}

// ── Step 2: Fetch skip times from ONE provider (was 5) ──
async function getSkipTimes(
  anikageId: string,
  epNum: number,
  type: "sub" | "dub",
): Promise<AniKageSkipResult & { servers: AniKageServer[] }> {
  try {
    const apiUrl = encodeURIComponent(
      `${ANIKAGE_BASE}/api/media/anime/${anikageId}/episodes/${epNum}/sources?provider=${SKIP_PROVIDER}&lang=${type}`,
    );
    const ref = encodeURIComponent(`${ANIKAGE_BASE}/`);
    const proxyUrl = `${WORKER_BASE}/proxy?url=${apiUrl}&ref=${ref}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(proxyUrl, {
      headers: { "User-Agent": HEADERS["User-Agent"] },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { intro: null, outro: null, servers: [] };
    }

    const data = await res.json();
    // Validate skip times — AniKage returns {start: 0, end: 0} when there's
    // no data for this anime/episode. The validator filters that out.
    const intro = validateSkipTime(
      data.intro ? { start: data.intro.start, end: data.intro.end } : null,
      "intro",
    );
    const outro = validateSkipTime(
      data.outro ? { start: data.outro.start, end: data.outro.end } : null,
      "outro",
    );

    // Extract embed URLs as servers (for backward compatibility)
    const servers: AniKageServer[] = [];
    const embeds = (data.embeds || []).filter((e: any) => e.status === "ok" && e.url);
    for (const embed of embeds) {
      const serverName = embed.server || SKIP_PROVIDER;
      servers.push({
        name: `AniKage ${serverName.charAt(0).toUpperCase() + serverName.slice(1)}`,
        provider: SKIP_PROVIDER,
        m3u8Url: embed.url,
        type,
        quality: "1080p",
      });
    }

    // Also extract source URLs (prox.anikage.cc tokens — encrypted, may not work)
    const sources = (data.sources || []).filter((s: any) => s.url && s.isM3U8);
    for (const src of sources) {
      const streamUrl = `https://prox.anikage.cc/m3u8/${src.url}`;
      if (!servers.some((s) => s.m3u8Url === streamUrl)) {
        servers.push({
          name: `AniKage ${SKIP_PROVIDER} (${src.quality || "auto"})`,
          provider: SKIP_PROVIDER,
          m3u8Url: streamUrl,
          type,
          quality: src.quality || "auto",
        });
      }
    }

    return { intro, outro, servers };
  } catch (err) {
    console.error(`[anikage-fast] getSkipTimes error:`, err);
    return { intro: null, outro: null, servers: [] };
  }
}

// ── Main: resolve skip times (FAST — max 3 requests total) ──
export async function resolveAniKage(
  anilistId: number,
  epNum: number,
  type: "sub" | "dub",
  title: string,
): Promise<AniKageResult | null> {
  try {
    const anikageId = await resolveAniKageId(anilistId, title);
    if (!anikageId) return null;

    const result = await getSkipTimes(anikageId, epNum, type);

    return {
      servers: result.servers,
      anikageId,
      intro: result.intro,
      outro: result.outro,
    };
  } catch (err) {
    console.error(`[anikage-fast] resolveAniKage error:`, err);
    return null;
  }
}

// ── Batch: resolve sub + dub in parallel ──
export async function resolveAniKageBoth(
  anilistId: number,
  epNum: number,
  title: string,
): Promise<{
  sub: AniKageResult | null;
  dub: AniKageResult | null;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}> {
  // Only fetch sub (skip times are the same for sub and dub)
  const sub = await resolveAniKage(anilistId, epNum, "sub", title);
  // Skip times are the same — don't waste another request for dub
  const intro = sub?.intro || null;
  const outro = sub?.outro || null;
  return { sub, dub: null, intro, outro };
}
