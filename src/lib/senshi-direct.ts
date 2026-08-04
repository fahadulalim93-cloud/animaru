/**
 * Senshi Direct — fast server-side resolver for senshi.live streams.
 *
 * Senshi provides HLS m3u8 streams from ninstream.com with intro/outro
 * skip times. Works for BOTH new AND old anime.
 *
 * Pipeline:
 *   1. Resolve AniList ID → Senshi anime ID (via title search)
 *   2. Fetch episode-embeds: GET /episode-embeds/{senshiId}/{epNum}
 *   3. Extract ninstream.com m3u8 URL
 *
 * The m3u8 URLs need Referer: https://senshi.live/ (handled by proxy).
 *
 * Senshi uses MAL IDs internally, so we resolve via AniList title search.
 * All ID mappings are cached for 1 hour.
 */

const SENSHI_BASE = "https://senshi.live";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://senshi.live/",
  Origin: "https://senshi.live",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

/** Direct fetch with timeout — Senshi API works directly from server-side. */
async function directFetch(url: string, options?: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      headers: { ...HEADERS, ...(options?.headers as Record<string, string>) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// ── Caches ──
const senshiIdCache = new Map<number, number | null>(); // anilistId → senshiId
const CACHE_TTL = 60 * 60 * 1000;
const cacheTimestamps = new Map<string, number>();

function isCacheFresh(key: string): boolean {
  const ts = cacheTimestamps.get(key);
  if (!ts) return false;
  return Date.now() - ts < CACHE_TTL;
}

// ── Types ──
export interface SenshiResult {
  m3u8Url: string;
  senshiId: number;
  status: string;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

// ── Step 1: Resolve AniList ID → Senshi anime ID ──
// Uses AniList GraphQL to get the title, then searches Senshi by title.
async function resolveSenshiId(
  anilistId: number,
  title: string,
): Promise<number | null> {
  const cacheKey = `senshi:${anilistId}`;
  if (senshiIdCache.has(anilistId) && isCacheFresh(cacheKey)) {
    return senshiIdCache.get(anilistId)!;
  }

  try {
    // Search Senshi by title via POST /anime/filter (through Worker proxy)
    const res = await directFetch(`${SENSHI_BASE}/anime/filter`, {
      method: "POST",
      headers: {
        ...HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ searchTerm: title, page: 1, limit: 10 }),
    });

    if (!res.ok) {
      console.error(`[senshi-direct] search HTTP ${res.status}`);
      senshiIdCache.set(anilistId, null);
      cacheTimestamps.set(cacheKey, Date.now());
      return null;
    }

    const data = await res.json();
    const results: any[] = data.data || [];

    if (results.length === 0) {
      senshiIdCache.set(anilistId, null);
      cacheTimestamps.set(cacheKey, Date.now());
      return null;
    }

    // Find best match by title
    const titleLower = title.toLowerCase();
    let bestMatch: any = null;

    // Prefer exact title match
    for (const a of results) {
      const aTitle = (a.title_english || a.title || "").toLowerCase();
      if (aTitle === titleLower) {
        bestMatch = a;
        break;
      }
    }

    // Fallback: partial match (first 15 chars)
    if (!bestMatch) {
      for (const a of results) {
        const aTitle = (a.title_english || a.title || "").toLowerCase();
        if (aTitle.includes(titleLower.slice(0, 15)) || titleLower.includes(aTitle.slice(0, 15))) {
          bestMatch = a;
          break;
        }
      }
    }

    // Last resort: first result
    if (!bestMatch) bestMatch = results[0];

    const senshiId = bestMatch.id;
    console.log(`[senshi-direct] AniList ${anilistId} → Senshi ${senshiId} ("${bestMatch.title}")`);

    senshiIdCache.set(anilistId, senshiId);
    cacheTimestamps.set(cacheKey, Date.now());
    return senshiId;
  } catch (err) {
    console.error(`[senshi-direct] resolveSenshiId error:`, err);
    senshiIdCache.set(anilistId, null);
    cacheTimestamps.set(cacheKey, Date.now());
    return null;
  }
}

// ── Step 2: Fetch episodes (for intro/outro) ──
async function getEpisodeInfo(
  senshiId: number,
  epNum: number,
): Promise<{ intro: any; outro: any } | null> {
  try {
    const res = await directFetch(`${SENSHI_BASE}/episodes/${senshiId}`, undefined, 6000);

    if (!res.ok) return null;

    const data = await res.json();
    const episodes: any[] = Array.isArray(data) ? data : (data.data || data.episodes || []);
    const ep = episodes.find((e: any) => e.ep_id === epNum || e.episode_number === epNum);

    if (!ep) return null;

    // Validate skip times — Senshi occasionally returns 0/empty values
    // when the anime has no intro/outro data.
    const { validateSkipTime } = await import("./episode-metadata");
    const intro = validateSkipTime(
      ep.intro_start != null && ep.intro_end != null
        ? { start: ep.intro_start, end: ep.intro_end }
        : null,
      "intro",
    );
    const outro = validateSkipTime(
      ep.outro_start != null && ep.outro_end != null
        ? { start: ep.outro_start, end: ep.outro_end }
        : null,
      "outro",
    );

    return { intro, outro };
  } catch {
    return null;
  }
}

// ── Step 3: Fetch episode-embeds (m3u8 URLs) ──
async function getEpisodeEmbeds(
  senshiId: number,
  epNum: number,
): Promise<{ url: string; status: string } | null> {
  try {
    const res = await directFetch(`${SENSHI_BASE}/episode-embeds/${senshiId}/${epNum}`);

    if (!res.ok) return null;

    const data = await res.json();
    const embeds: any[] = Array.isArray(data) ? data : [data];

    // Find the first embed with a URL
    for (const e of embeds) {
      if (e.url) {
        return { url: e.url, status: e.status || "unknown" };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ── Main: resolve m3u8 + intro/outro ──
export async function resolveSenshi(
  anilistId: number,
  epNum: number,
  title: string,
): Promise<SenshiResult | null> {
  try {
    const senshiId = await resolveSenshiId(anilistId, title);
    if (!senshiId) return null;

    // Fetch embeds + episode info (for intro/outro) in parallel
    const [embedResult, epInfo] = await Promise.all([
      getEpisodeEmbeds(senshiId, epNum),
      getEpisodeInfo(senshiId, epNum),
    ]);

    if (!embedResult?.url) return null;

    return {
      m3u8Url: embedResult.url,
      senshiId,
      status: embedResult.status,
      intro: epInfo?.intro || null,
      outro: epInfo?.outro || null,
    };
  } catch (err) {
    console.error(`[senshi-direct] resolveSenshi error:`, err);
    return null;
  }
}
