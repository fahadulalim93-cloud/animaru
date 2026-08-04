/**
 * AniNeko Direct — fast server-side resolver for anineko.to embed URLs.
 *
 * AniNeko (anineko.to) is a multi-server anime streaming site. Each episode
 * page (/watch/{slug}/ep-{num}) contains multiple server buttons with
 * `data-video` attributes pointing to iframeable embed URLs (vivibebe.site,
 * otakuhg.site, otakuvid.online, playmogo.com, etc.).
 *
 * Pipeline:
 *   1. Resolve AniList ID → AniNeko slug (via Worker-proxied search)
 *   2. Fetch episode page: GET /watch/{slug}/ep-{num}
 *   3. Extract data-video URLs from server buttons
 *
 * The embed URLs are directly iframeable — no proxy needed.
 *
 * Slug mappings are cached in-memory for 1 hour.
 */

const ANINEKO_BASE = "https://anineko.to";
const WORKER_BASE =
  process.env.NEXT_PUBLIC_PROXY_BASE ||
  "https://luffytv-proxy.ggy892767.workers.dev";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://anineko.to/",
};

// ── Caches ──
const slugCache = new Map<number, string | null>(); // anilistId → slug
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const cacheTimestamps = new Map<string, number>();

function isCacheFresh(key: string): boolean {
  const ts = cacheTimestamps.get(key);
  if (!ts) return false;
  return Date.now() - ts < CACHE_TTL;
}

// ── Types ──
export interface AniNekoServer {
  name: string;
  url: string;
  isDefault: boolean;
}

export interface AniNekoResult {
  slug: string;
  servers: AniNekoServer[];
}

export interface AniNekoM3u8Result {
  m3u8Url: string;
  serverName: string;
  subtitleUrl?: string;
}

// ── Step 1: Resolve AniList ID → AniNeko slug ──
async function resolveSlug(
  anilistId: number,
  title: string,
): Promise<string | null> {
  const cacheKey = `anineko:${anilistId}`;
  if (slugCache.has(anilistId) && isCacheFresh(cacheKey)) {
    return slugCache.get(anilistId)!;
  }

  try {
    // Search AniNeko via Worker proxy
    const searchUrl = encodeURIComponent(
      `${ANINEKO_BASE}/search?q=${encodeURIComponent(title)}`,
    );
    const ref = encodeURIComponent(`${ANINEKO_BASE}/`);
    const proxyUrl = `${WORKER_BASE}/proxy?url=${searchUrl}&ref=${ref}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(proxyUrl, {
      headers: { "User-Agent": HEADERS["User-Agent"] },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[anineko-direct] search HTTP ${res.status} for "${title}"`);
      slugCache.set(anilistId, null);
      cacheTimestamps.set(cacheKey, Date.now());
      return null;
    }

    const html = await res.text();

    // Extract slug from /watch/{slug} links
    const linkPattern = /href="\/watch\/([^"\/]+)"/g;
    const matches = [...html.matchAll(linkPattern)];

    if (matches.length === 0) {
      // Fallback: construct slug from title (lowercase, hyphenated)
      const fallbackSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      console.log(`[anineko-direct] no search results, using fallback slug: ${fallbackSlug}`);
      slugCache.set(anilistId, fallbackSlug);
      cacheTimestamps.set(cacheKey, Date.now());
      return fallbackSlug;
    }

    // Find the best match by title
    const titleLower = title.toLowerCase();
    const slugCandidates = matches
      .map((m) => m[1])
      .filter((s, i, arr) => arr.indexOf(s) === i); // dedupe

    // Try exact slug match (title → slug)
    const expectedSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    let bestSlug: string | null = null;
    for (const slug of slugCandidates) {
      if (slug === expectedSlug) {
        bestSlug = slug;
        break;
      }
      if (!bestSlug && slug.includes(expectedSlug.slice(0, 10))) {
        bestSlug = slug;
      }
    }
    if (!bestSlug) bestSlug = slugCandidates[0];

    console.log(`[anineko-direct] resolved AniList ${anilistId} → slug "${bestSlug}"`);
    slugCache.set(anilistId, bestSlug);
    cacheTimestamps.set(cacheKey, Date.now());
    return bestSlug;
  } catch (err) {
    console.error(`[anineko-direct] resolveSlug error:`, err);
    // Fallback: construct slug from title
    const fallbackSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    slugCache.set(anilistId, fallbackSlug);
    cacheTimestamps.set(cacheKey, Date.now());
    return fallbackSlug;
  }
}

// ── Step 2: Fetch episode page and extract server URLs ──
async function getServers(
  slug: string,
  episodeNum: number,
): Promise<AniNekoServer[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(
      `${ANINEKO_BASE}/watch/${slug}/ep-${episodeNum}`,
      { headers: HEADERS, signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[anineko-direct] episode page HTTP ${res.status} for ${slug}/ep-${episodeNum}`);
      return [];
    }

    const html = await res.text();

    // Extract server buttons with data-video attributes
    // Pattern: <button class="nv-server-btn server-video server [default]" data-video="URL">
    const serverPattern =
      /<button[^>]*class="nv-server-btn server-video server\s*(?:default)?"[^>]*data-video="([^"]+)"/g;
    const matches = [...html.matchAll(serverPattern)];

    // Also check for data-video on non-default servers
    const allServerPattern =
      /<button[^>]*class="nv-server-btn server-video[^"]*"[^>]*data-video="([^"]+)"/g;
    const allMatches = [...html.matchAll(allServerPattern)];

    const servers: AniNekoServer[] = [];
    const seen = new Set<string>();

    for (const match of allMatches) {
      const url = match[1];
      if (!url || seen.has(url)) continue;
      seen.add(url);

      // Check if this button has "default" class
      const isDefault = match[0].includes("default");

      // Derive server name from the URL domain
      let name = "AniNeko";
      try {
        const domain = new URL(url).hostname.replace("www.", "");
        if (domain.includes("vivibebe")) name = "AniNeko Vivibe";
        else if (domain.includes("otakuhg")) name = "AniNeko OtakuHG";
        else if (domain.includes("otakuvid")) name = "AniNeko OtakuVid";
        else if (domain.includes("playmogo")) name = "AniNeko PlayMogo";
        else name = `AniNeko ${domain.split(".")[0]}`;
      } catch {
        /* keep default name */
      }

      servers.push({ name, url, isDefault });
    }

    return servers;
  } catch (err) {
    console.error(`[anineko-direct] getServers error:`, err);
    return [];
  }
}

// ── Main: resolve servers for AniList ID + episode ──
export async function resolveAniNekoServers(
  anilistId: number,
  episodeNum: number,
  title: string,
): Promise<AniNekoServer[]> {
  try {
    const slug = await resolveSlug(anilistId, title);
    if (!slug) return [];

    const servers = await getServers(slug, episodeNum);
    return servers;
  } catch (err) {
    console.error(`[anineko-direct] resolveAniNekoServers error:`, err);
    return [];
  }
}

// ── Extract direct m3u8 from vivibebe.site embed pages ──
// vivibebe.site/{id} embed pages contain: src = ".../public/stream/{id}/master.m3u8"
async function extractM3u8FromEmbed(embedUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(embedUrl, {
      headers: { ...HEADERS, Referer: "https://anineko.to/" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const html = await res.text();

    // Look for m3u8 URL in the embed page
    // Pattern: src = "https://vivibebe.site/public/stream/{id}/master.m3u8"
    const m3u8Match = html.match(/https?:\/\/[^"'\s]+\/public\/stream\/[^"'\s]+\/master\.m3u8/);
    if (m3u8Match) return m3u8Match[0];

    // Fallback: any m3u8 URL in the page
    const anyM3u8 = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
    if (anyM3u8) return anyM3u8[0];

    return null;
  } catch {
    return null;
  }
}

// ── Main: resolve DIRECT m3u8 URLs from AniNeko (no embeds) ──
// Scrapes the episode page, finds all data-video URLs, then extracts m3u8
// from each vivibebe.site embed page. Returns direct m3u8 URLs.
export async function resolveAniNekoM3u8(
  anilistId: number,
  episodeNum: number,
  title: string,
): Promise<AniNekoM3u8Result[]> {
  try {
    const slug = await resolveSlug(anilistId, title);
    if (!slug) return [];

    const servers = await getServers(slug, episodeNum);
    if (servers.length === 0) return [];

    // Extract m3u8 from each embed URL in parallel
    const results = await Promise.all(
      servers.slice(0, 5).map(async (srv) => {
        // For vivibebe.site URLs, extract the m3u8 from the embed page
        if (srv.url.includes("vivibebe.site")) {
          const m3u8Url = await extractM3u8FromEmbed(srv.url);
          if (m3u8Url) {
            // Check for subtitle URL in the data-video attribute
            const subMatch = srv.url.match(/[?&]sub=(https?:\/\/[^&]+)/);
            return {
              m3u8Url,
              serverName: srv.name,
              subtitleUrl: subMatch?.[1],
            };
          }
        }
        // For other embed URLs (otakuhg, otakuvid, playmogo), return as embed
        // (these don't have extractable m3u8 — they're iframe-only)
        return null;
      }),
    );

    return results.filter((r) => r !== null) as AniNekoM3u8Result[];
  } catch (err) {
    console.error(`[anineko-direct] resolveAniNekoM3u8 error:`, err);
    return [];
  }
}
