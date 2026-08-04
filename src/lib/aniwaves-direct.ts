/**
 * AniWaves Direct — scraper for aniwaves.ru
 *
 * AniWaves has a large library and multiple servers per episode.
 *
 * Pipeline:
 *   1. Search: GET /filter — scrape anime slugs from HTML
 *   2. Watch page: GET /watch/{slug} — extract data-id (anime ID)
 *   3. Server list: GET /ajax/server/list?servers={animeId}&eps={epNum} — get data-link-id + server info
 *   4. Sources: GET /ajax/sources?id={linkId} — get embed URL + skip_data (intro/outro)
 *
 * The embed URL is iframeable (echovideo.ru, gn1r5n.org, myvidplay.com).
 * The JS player handles PoW/captcha client-side in the browser.
 */

const ANIWAVES_BASE = "https://aniwaves.ru";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/json,*/*",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://aniwaves.ru/",
  "X-Requested-With": "XMLHttpRequest",
};

// ── Caches ──
const animeIdCache = new Map<string, string | null>(); // slug → animeId
const CACHE_TTL = 60 * 60 * 1000;
const cacheTimestamps = new Map<string, number>();

function isCacheFresh(key: string): boolean {
  const ts = cacheTimestamps.get(key);
  if (!ts) return false;
  return Date.now() - ts < CACHE_TTL;
}

// ── Types ──
export interface AniWavesServer {
  name: string;
  embedUrl: string;
  type: "sub" | "dub";
  svId: number;
}

export interface AniWavesResult {
  servers: AniWavesServer[];
  animeId: string;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

// ── Step 1: Resolve title → anime slug → anime ID ──
async function resolveAnimeId(title: string): Promise<{ slug: string; animeId: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    // Search via the filter page
    const res = await fetch(
      `${ANIWAVES_BASE}/filter?search=${encodeURIComponent(title)}`,
      { headers: { ...HEADERS, Accept: "text/html" }, signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!res.ok) return null;

    const html = await res.text();

    // Extract slugs from watch links
    const slugPattern = /href="\/watch\/([^"]+)"/g;
    const matches = [...html.matchAll(slugPattern)];
    const slugs = [...new Set(matches.map((m) => m[1]))];

    if (slugs.length === 0) return null;

    // Find best match by title
    const titleLower = title.toLowerCase().replace(/[^a-z0-9]/g, "");
    let bestSlug: string | null = null;
    for (const slug of slugs) {
      const slugClean = slug.split("-").slice(0, -1).join("").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (slugClean.includes(titleLower.slice(0, 15)) || titleLower.includes(slugClean.slice(0, 15))) {
        bestSlug = slug;
        break;
      }
    }
    if (!bestSlug) bestSlug = slugs[0];

    // Fetch the watch page to get data-id (anime ID)
    const watchRes = await fetch(`${ANIWAVES_BASE}/watch/${bestSlug}`, {
      headers: { ...HEADERS, Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!watchRes.ok) return null;
    const watchHtml = await watchRes.text();

    const idMatch = watchHtml.match(/data-id="(\d+)"/);
    if (!idMatch) return null;

    console.log(`[aniwaves-direct] title="${title}" → slug="${bestSlug}" → animeId=${idMatch[1]}`);
    return { slug: bestSlug, animeId: idMatch[1] };
  } catch (err) {
    console.error(`[aniwaves-direct] resolveAnimeId error:`, err);
    return null;
  }
}

// ── Step 2: Get server list + link IDs ──
async function getServerList(
  animeId: string,
  epNum: number,
): Promise<Array<{ svId: number; linkId: string; type: string }>> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `${ANIWAVES_BASE}/ajax/server/list?servers=${animeId}&eps=${epNum}`,
      { headers: HEADERS, signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    const html = data.result || "";

    // Extract server items: data-sv-id + data-link-id + data-type
    const serverPattern = /data-sv-id="(\d+)"[^>]*data-link-id="([^"]+)"[^>]*/g;
    const typePattern = /data-type="(sub|dub|softsub)"/g;

    // Find all server entries
    const servers: Array<{ svId: number; linkId: string; type: string }> = [];
    const serverMatches = [...html.matchAll(serverPattern)];
    const typeMatches = [...html.matchAll(typePattern)];

    // Track the current type (sub/dub sections)
    let currentType = "sub";
    const htmlLines = html.split("data-type=");
    let typeIdx = 0;

    for (const match of serverMatches) {
      const svId = parseInt(match[1], 10);
      const linkId = match[2];
      // Determine type by looking at nearby data-type
      const matchPos = html.indexOf(match[0]);
      const beforeMatch = html.substring(0, matchPos);
      const lastType = beforeMatch.match(/data-type="(sub|dub|softsub)"/g);
      const type = lastType ? lastType[lastType.length - 1].match(/"(sub|dub|softsub)"/)?.[1] || "sub" : "sub";

      servers.push({ svId, linkId, type: type === "softsub" ? "sub" : type });
    }

    return servers;
  } catch (err) {
    console.error(`[aniwaves-direct] getServerList error:`, err);
    return [];
  }
}

// ── Step 3: Get embed URL + skip data for each server ──
async function getSources(
  linkId: string,
  animeId: string,
  epNum: number,
): Promise<{ url: string; skipData: any } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `${ANIWAVES_BASE}/ajax/sources?id=${linkId}&asi=0&autoPlay=0`,
      { headers: { ...HEADERS, Referer: `${ANIWAVES_BASE}/watch/${animeId}` }, signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    const result = data.result || {};
    if (!result.url) return null;

    return { url: result.url, skipData: result.skip_data || null };
  } catch {
    return null;
  }
}

// ── Main: resolve all servers + skip times ──
export async function resolveAniWaves(
  anilistId: number,
  epNum: number,
  title: string,
): Promise<AniWavesResult | null> {
  try {
    const resolved = await resolveAnimeId(title);
    if (!resolved) return null;

    const { animeId } = resolved;

    // Get server list
    const serverEntries = await getServerList(animeId, epNum);
    if (serverEntries.length === 0) return null;

    // Fetch sources for each server in parallel (limit to 6)
    const sourceResults = await Promise.all(
      serverEntries.slice(0, 6).map(async (entry) => {
        const sources = await getSources(entry.linkId, animeId, epNum);
        if (!sources) return null;

        const SERVER_NAMES: Record<number, string> = {
          1: "AniWaves SV1",
          2: "AniWaves SV2",
          4: "AniWaves SV4",
        };

        return {
          name: SERVER_NAMES[entry.svId] || `AniWaves SV${entry.svId}`,
          embedUrl: sources.url,
          type: entry.type as "sub" | "dub",
          svId: entry.svId,
          skipData: sources.skipData,
        };
      }),
    );

    const servers = sourceResults.filter((s): s is NonNullable<typeof s> => s !== null);
    if (servers.length === 0) return null;

    // Get skip times from the first server that has them
    let intro: { start: number; end: number } | null = null;
    let outro: { start: number; end: number } | null = null;
    for (const s of servers) {
      if (s.skipData?.intro?.[1] > 0) {
        intro = { start: s.skipData.intro[0], end: s.skipData.intro[1] };
      }
      if (s.skipData?.outro?.[1] > 0) {
        outro = { start: s.skipData.outro[0], end: s.skipData.outro[1] };
      }
      if (intro && outro) break;
    }

    console.log(`[aniwaves-direct] AniList ${anilistId} ep ${epNum}: ${servers.length} servers, intro=${intro}, outro=${outro}`);

    return {
      servers: servers.map(s => ({ name: s.name, embedUrl: s.embedUrl, type: s.type, svId: s.svId })),
      animeId,
      intro,
      outro,
    };
  } catch (err) {
    console.error(`[aniwaves-direct] resolveAniWaves error:`, err);
    return null;
  }
}
