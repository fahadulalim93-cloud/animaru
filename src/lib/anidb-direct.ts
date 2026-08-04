/**
 * AniDB Direct — fast server-side resolver for anidb.app embed URLs.
 *
 * AniDB is a reliable anime streaming site with HLS streams served from
 * hls.anidb.app. The embed URLs are iframeable (JW Player) and don't
 * dead-link — the tokens are stable per episode+language.
 *
 * Pipeline:
 *   1. Resolve AniList ID → AniDB anime ID (via Worker-proxied search)
 *   2. Fetch episode list: GET /api/frontend/anime/{anidbId}/episodes
 *   3. Find episode by number → get episode ID
 *   4. Fetch languages: GET /api/frontend/episode/{epId}/languages
 *   5. Extract embed_url for sub (jpn) or dub (eng)
 *
 * The embed URL (https://anidb.app/embed/{token}) is directly iframeable.
 * The HLS m3u8 inside it (hls.anidb.app/stream/{token}/master.m3u8) is
 * also directly playable with CORS permissive headers.
 *
 * All ID mappings are cached in-memory for 1 hour.
 */

const ANIDB_BASE = "https://anidb.app";
const WORKER_BASE =
  process.env.NEXT_PUBLIC_PROXY_BASE ||
  "https://luffytv-proxy.ggy892767.workers.dev";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://anidb.app/",
  Origin: "https://anidb.app",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

// ── Caches ──
const anidbIdCache = new Map<number, number | null>(); // anilistId → anidbId
const episodeCache = new Map<number, Map<number, number>>(); // anidbId → (epNum → epId)
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const cacheTimestamps = new Map<string, number>();

function isCacheFresh(key: string): boolean {
  const ts = cacheTimestamps.get(key);
  if (!ts) return false;
  return Date.now() - ts < CACHE_TTL;
}

// ── Types ──
export interface AniDbEmbedResult {
  embedUrl: string;
  /** Direct HLS m3u8 URL extracted from the embed page's JW Player config. */
  m3u8Url?: string | null;
  anidbId: number;
  episodeId: number;
  type: "sub" | "dub";
}

// ── Step 1: Resolve AniList ID → AniDB ID ──
async function resolveAniDbId(
  anilistId: number,
  title: string,
): Promise<number | null> {
  const cacheKey = `anidb:${anilistId}`;
  if (anidbIdCache.has(anilistId) && isCacheFresh(cacheKey)) {
    return anidbIdCache.get(anilistId)!;
  }

  // If no title provided, try to get it from AniList
  if (!title || title.trim().length === 0) {
    try {
      const alRes = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query($id:Int){Media(id:$id,type:ANIME){title{english romaji}}}`,
          variables: { id: anilistId },
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (alRes.ok) {
        const alData = await alRes.json();
        title = alData?.data?.Media?.title?.english || alData?.data?.Media?.title?.romaji || "";
      }
    } catch { /* ignore */ }
    if (!title) {
      console.error(`[anidb-direct] no title for AniList ${anilistId} — can't search`);
      anidbIdCache.set(anilistId, null);
      cacheTimestamps.set(cacheKey, Date.now());
      return null;
    }
  }

  try {
    // Search AniDB via Worker proxy (search endpoint is CF-protected)
    const searchUrl = encodeURIComponent(
      `${ANIDB_BASE}/search/suggestions?q=${encodeURIComponent(title)}`,
    );
    const ref = encodeURIComponent(`${ANIDB_BASE}/`);
    const proxyUrl = `${WORKER_BASE}/proxy?url=${searchUrl}&ref=${ref}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(proxyUrl, {
      headers: { "User-Agent": HEADERS["User-Agent"] },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[anidb-direct] search HTTP ${res.status} for "${title}"`);
      anidbIdCache.set(anilistId, null);
      cacheTimestamps.set(cacheKey, Date.now());
      return null;
    }

    const html = await res.text();

    // Extract AniDB IDs from result URLs: /anime/{slug}-{anidbId}
    // Also look for anilist ID references to match the right anime
    const linkPattern = /href="https:\/\/anidb\.app\/anime\/[^"]*?-(\d+)"/g;
    const matches = [...html.matchAll(linkPattern)];

    if (matches.length === 0) {
      console.error(`[anidb-direct] no results for "${title}"`);
      anidbIdCache.set(anilistId, null);
      cacheTimestamps.set(cacheKey, Date.now());
      return null;
    }

    // Find the best match by checking if the title appears in the result text
    // near each link. The search results HTML has format:
    //   <a href="https://anidb.app/anime/one-piece-3880" data-search-item ...>
    //     <p class="text-sm font-medium">One Piece</p>
    //   </a>
    const titleLower = title.toLowerCase();
    let bestId: number | null = null;

    // Split by result items and find the one matching the title
    const items = html.split(/<a href="https:\/\/anidb\.app\/anime\//);
    for (let i = 1; i < items.length; i++) {
      const item = items[i];
      const idMatch = item.match(/^.*?-(\d+)"/);
      if (!idMatch) continue;
      const id = parseInt(idMatch[1], 10);

      // Extract the title from this result item
      const titleMatch = item.match(/<p class="text-sm[^"]*"[^>]*>([^<]+)<\/p>/);
      if (titleMatch) {
        // Decode HTML entities (&#039; → ', &amp; → &, etc.) before comparing
        const resultTitle = titleMatch[1].trim()
          .replace(/&#0?39;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .toLowerCase();
        
        // Exact match
        if (resultTitle === titleLower) {
          bestId = id;
          break;
        }
        // Partial match (search term is contained in result)
        if (!bestId && resultTitle.includes(titleLower)) {
          bestId = id;
        }
        // Also check reverse: result title is contained in search term
        // (handles "Frieren" matching "Frieren: Beyond Journey's End")
        if (!bestId && titleLower.includes(resultTitle.split(":")[0].trim())) {
          bestId = id;
        }
      }

      // If no title match found yet, take the first result
      if (!bestId) bestId = id;
    }

    if (bestId) {
      console.log(`[anidb-direct] resolved AniList ${anilistId} → AniDB ${bestId} ("${title}")`);
    }

    anidbIdCache.set(anilistId, bestId);
    cacheTimestamps.set(cacheKey, Date.now());
    return bestId;
  } catch (err) {
    console.error(`[anidb-direct] resolveAniDbId error for ${anilistId}:`, err);
    anidbIdCache.set(anilistId, null);
    cacheTimestamps.set(cacheKey, Date.now());
    return null;
  }
}

// ── Step 2: Fetch episode list ──
// Uses the Worker proxy because AniDB's API is Cloudflare-protected
// and blocks Node.js fetch (TLS fingerprinting).
async function getEpisodes(anidbId: number): Promise<Map<number, number>> {
  const cacheKey = `anidb-eps:${anidbId}`;
  if (episodeCache.has(anidbId) && isCacheFresh(cacheKey)) {
    return episodeCache.get(anidbId)!;
  }

  try {
    const apiUrl = encodeURIComponent(`${ANIDB_BASE}/api/frontend/anime/${anidbId}/episodes`);
    const ref = encodeURIComponent(`${ANIDB_BASE}/`);
    const proxyUrl = `${WORKER_BASE}/proxy?url=${apiUrl}&ref=${ref}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(proxyUrl, {
      headers: { "User-Agent": HEADERS["User-Agent"] },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[anidb-direct] episodes HTTP ${res.status} for AniDB ${anidbId}`);
      return new Map();
    }

    const data = await res.json();
    const episodes: Array<{ id: number; number: number }> = data.episodes || [];

    const epMap = new Map<number, number>();
    for (const ep of episodes) {
      epMap.set(ep.number, ep.id);
    }

    episodeCache.set(anidbId, epMap);
    cacheTimestamps.set(cacheKey, Date.now());
    return epMap;
  } catch (err) {
    console.error(`[anidb-direct] getEpisodes error:`, err);
    return new Map();
  }
}

// ── Step 3: Fetch languages for an episode → get embed URL ──
// Uses the Worker proxy (same reason as getEpisodes).
async function getEmbedUrl(
  episodeId: number,
  type: "sub" | "dub",
): Promise<string | null> {
  try {
    const apiUrl = encodeURIComponent(`${ANIDB_BASE}/api/frontend/episode/${episodeId}/languages`);
    const ref = encodeURIComponent(`${ANIDB_BASE}/`);
    const proxyUrl = `${WORKER_BASE}/proxy?url=${apiUrl}&ref=${ref}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(proxyUrl, {
      headers: { "User-Agent": HEADERS["User-Agent"] },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[anidb-direct] languages HTTP ${res.status} for ep ${episodeId}`);
      return null;
    }

    const data = await res.json();
    const languages: Array<{ code: string; name: string; embed_url: string }> =
      data.languages || [];

    // sub = Japanese (jpn), dub = English (eng)
    const targetCode = type === "dub" ? "eng" : "jpn";
    // STRICT MATCH: only return the requested language. If it's not
    // available (e.g., anime has no English dub), return null instead
    // of falling back to languages[0] (which is usually Japanese sub).
    // The old fallback caused "AniDB (Dub)" to play the sub video — the
    // user would click dub and get Japanese audio with no warning.
    const lang = languages.find((l) => l.code === targetCode);

    if (!lang) {
      console.log(`[anidb-direct] no ${targetCode} (${type}) for ep ${episodeId} — available: [${languages.map(l => l.code).join(",")}]`);
      return null;
    }

    return lang.embed_url || null;
  } catch (err) {
    console.error(`[anidb-direct] getEmbedUrl error:`, err);
    return null;
  }
}

// ── Step 4: Extract m3u8 URL from the embed page ──
// The embed page (https://anidb.app/embed/{token}) contains a JW Player
// setup script with: sources: [{ file: 'https://hls.anidb.app/.../master.m3u8', type: 'hls' }]
// We scrape this to get the direct m3u8 URL for hls.js playback (no iframe needed).
async function extractM3u8FromEmbed(embedUrl: string): Promise<string | null> {
  try {
    // Fetch the embed page via Worker proxy (anidb.app is CF-protected)
    const pageUrl = encodeURIComponent(embedUrl);
    const ref = encodeURIComponent(`${ANIDB_BASE}/`);
    const proxyUrl = `${WORKER_BASE}/proxy?url=${pageUrl}&ref=${ref}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(proxyUrl, {
      headers: { "User-Agent": HEADERS["User-Agent"] },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[anidb-direct] embed page HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();

    // Extract m3u8 URL from JW Player sources: [{ file: '...' }]
    const match = html.match(/file:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/);
    if (match) {
      return match[1];
    }

    // Fallback: look for any hls.anidb.app URL
    const hlsMatch = html.match(/(https:\/\/hls\.anidb\.app\/[^\s'"]+)/);
    if (hlsMatch) {
      return hlsMatch[1];
    }

    console.error(`[anidb-direct] no m3u8 found in embed page`);
    return null;
  } catch (err) {
    console.error(`[anidb-direct] extractM3u8FromEmbed error:`, err);
    return null;
  }
}

// ── Main: resolve embed URL + m3u8 for AniList ID + episode ──
export async function resolveAniDbEmbed(
  anilistId: number,
  episodeNum: number,
  type: "sub" | "dub",
  title: string,
): Promise<AniDbEmbedResult | null> {
  try {
    // Step 1: AniList → AniDB ID
    const anidbId = await resolveAniDbId(anilistId, title);
    if (!anidbId) return null;

    // Step 2: Get episodes
    const epMap = await getEpisodes(anidbId);
    if (epMap.size === 0) return null;

    // Find the episode by number
    let episodeId = epMap.get(episodeNum);
    if (!episodeId) {
      // Try episode 1 as fallback (some anime have different numbering)
      episodeId = epMap.get(1);
      if (!episodeId) return null;
    }

    // Step 3: Get embed URL
    const embedUrl = await getEmbedUrl(episodeId, type);
    if (!embedUrl) return null;

    // Step 4: Try to extract m3u8 from embed page (for direct hls.js playback)
    // If this fails, we still return the embedUrl — the player will use it as an iframe.
    const m3u8Url = await extractM3u8FromEmbed(embedUrl);

    // If m3u8 extraction failed, return embed URL only (player will use iframe)
    return { embedUrl, m3u8Url: m3u8Url || null, anidbId, episodeId, type };
  } catch (err) {
    console.error(`[anidb-direct] resolveAniDbEmbed error:`, err);
    return null;
  }
}

// ── Batch: resolve both sub and dub in parallel ──
export async function resolveAniDbEmbeds(
  anilistId: number,
  episodeNum: number,
  title: string,
): Promise<{ sub: AniDbEmbedResult | null; dub: AniDbEmbedResult | null }> {
  const [sub, dub] = await Promise.all([
    resolveAniDbEmbed(anilistId, episodeNum, "sub", title),
    resolveAniDbEmbed(anilistId, episodeNum, "dub", title),
  ]);
  return { sub, dub };
}
