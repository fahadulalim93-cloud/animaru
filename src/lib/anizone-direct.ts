/**
 * AniZone Direct — fast scraper for anizone.to
 *
 * AniZone provides high-quality HLS streams with soft subtitles (ASS format,
 * 10+ languages). Uses the Vidstack player with suzaku.xin-cdn.xyz CDN.
 *
 * Pipeline:
 *   1. Search: GET /anime?search={title} → scrape slug from HTML
 *   2. Episode: GET /anime/{slug}/{epNum} → scrape m3u8 from HTML
 *   3. Extract subtitle URLs (ASS format, multiple languages)
 *
 * The m3u8 URL is: https://suzaku.xin-cdn.xyz/{uuid}/master.m3u8
 * Subtitles: https://suzaku.xin-cdn.xyz/{uuid}/subtitles/{n}_{lang}.ass
 *
 * No API needed — everything is in the HTML.
 */

const ANIZONE_BASE = "https://anizone.to";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://anizone.to/",
};

// ── Caches ──
const slugCache = new Map<number, string | null>();
const CACHE_TTL = 60 * 60 * 1000;
const cacheTimestamps = new Map<string, number>();

function isCacheFresh(key: string): boolean {
  const ts = cacheTimestamps.get(key);
  if (!ts) return false;
  return Date.now() - ts < CACHE_TTL;
}

// ── Types ──
export interface AniZoneResult {
  m3u8Url: string;
  slug: string;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
}

// ── Step 1: Resolve AniList ID → AniZone slug ──
async function resolveSlug(anilistId: number, title: string): Promise<string | null> {
  const cacheKey = `anizone:${anilistId}`;
  if (slugCache.has(anilistId) && isCacheFresh(cacheKey)) {
    return slugCache.get(anilistId)!;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `${ANIZONE_BASE}/anime?search=${encodeURIComponent(title)}`,
      { headers: HEADERS, signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!res.ok) {
      slugCache.set(anilistId, null);
      cacheTimestamps.set(cacheKey, Date.now());
      return null;
    }

    const html = await res.text();

    // Extract slugs from wire:navigate href links
    const slugPattern = /wire:navigate href="https:\/\/anizone\.to\/anime\/([a-z0-9]+)"/g;
    const matches = [...html.matchAll(slugPattern)];
    const slugs = [...new Set(matches.map((m) => m[1]))];

    if (slugs.length === 0) {
      slugCache.set(anilistId, null);
      cacheTimestamps.set(cacheKey, Date.now());
      return null;
    }

    // Try to find the best match by title
    // Look for the title text near each slug link
    const titleLower = title.toLowerCase();
    let bestSlug: string | null = null;

    for (const slug of slugs) {
      const slugIdx = html.indexOf(`/anime/${slug}`);
      if (slugIdx < 0) continue;
      // Look in the surrounding 1000 chars for the title
      const context = html.substring(slugIdx, slugIdx + 1000).toLowerCase();
      if (context.includes(titleLower) || titleLower.includes(slug)) {
        bestSlug = slug;
        break;
      }
    }

    // Fallback: first slug
    if (!bestSlug) bestSlug = slugs[0];

    console.log(`[anizone-direct] AniList ${anilistId} → slug "${bestSlug}"`);
    slugCache.set(anilistId, bestSlug);
    cacheTimestamps.set(cacheKey, Date.now());
    return bestSlug;
  } catch (err) {
    console.error(`[anizone-direct] resolveSlug error:`, err);
    slugCache.set(anilistId, null);
    cacheTimestamps.set(cacheKey, Date.now());
    return null;
  }
}

// ── Step 2: Fetch episode page and extract m3u8 + subtitles ──
async function getEpisodeStreams(
  slug: string,
  epNum: number,
): Promise<{ m3u8Url: string; subtitleTracks: Array<{ url: string; lang: string; label: string }> } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `${ANIZONE_BASE}/anime/${slug}/${epNum}`,
      { headers: HEADERS, signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[anizone-direct] episode page HTTP ${res.status} for ${slug}/${epNum}`);
      return null;
    }

    const html = await res.text();

    // Extract m3u8 URL from suzaku.xin-cdn.xyz
    const m3u8Match = html.match(/https:\/\/suzaku\.xin-cdn\.xyz\/[a-f0-9-]+\/master\.m3u8/);
    if (!m3u8Match) {
      console.error(`[anizone-direct] no m3u8 found in episode page`);
      return null;
    }
    const m3u8Url = m3u8Match[0];

    // Extract subtitle URLs (ASS format)
    // Pattern: https://suzaku.xin-cdn.xyz/{uuid}/subtitles/{n}_{lang}.ass
    const subPattern = /https:\/\/suzaku\.xin-cdn\.xyz\/[a-f0-9-]+\/subtitles\/(\d+)_(\w+)\.ass/g;
    const subMatches = [...html.matchAll(subPattern)];
    const subtitleTracks: Array<{ url: string; lang: string; label: string }> = [];

    const LANG_NAMES: Record<string, string> = {
      en: "English", ar: "Arabic", de: "German", "es-419": "Spanish (LA)",
      es: "Spanish", fr: "French", id: "Indonesian", it: "Italian",
      pt: "Portuguese", "pt-br": "Portuguese (BR)", ru: "Russian",
      ja: "Japanese", ko: "Korean", zh: "Chinese", vi: "Vietnamese",
      th: "Thai", pl: "Polish", tr: "Turkish", hi: "Hindi",
    };

    for (const match of subMatches) {
      const url = match[0];
      const lang = match[2];
      const label = LANG_NAMES[lang] || lang;
      subtitleTracks.push({ url, lang, label });
    }

    return { m3u8Url, subtitleTracks };
  } catch (err) {
    console.error(`[anizone-direct] getEpisodeStreams error:`, err);
    return null;
  }
}

// ── Main: resolve m3u8 + subtitles for AniList ID + episode ──
export async function resolveAniZone(
  anilistId: number,
  epNum: number,
  title: string,
): Promise<AniZoneResult | null> {
  try {
    const slug = await resolveSlug(anilistId, title);
    if (!slug) return null;

    const streams = await getEpisodeStreams(slug, epNum);
    if (!streams) return null;

    console.log(`[anizone-direct] AniList ${anilistId} ep ${epNum}: m3u8 found + ${streams.subtitleTracks.length} subtitles`);

    return {
      m3u8Url: streams.m3u8Url,
      slug,
      subtitleTracks: streams.subtitleTracks,
    };
  } catch (err) {
    console.error(`[anizone-direct] resolveAniZone error:`, err);
    return null;
  }
}
