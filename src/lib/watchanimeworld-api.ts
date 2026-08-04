/**
 * WatchAnimeWorld.top scraper — Hindi/Indian dub provider
 *
 * Site structure:
 *   - WordPress site with custom 'series' and 'movies' post types
 *   - Episode URLs: /episode/{anime-name}-{season}x{episode}/
 *   - Series URLs: /series/{anime-name}/
 *   - Language categories: /category/language/hindi/
 *
 * Episode page contains:
 *   1. Zephyrix player iframe: https://play.zephyrix.top/video/{hash}
 *      - Fire HLS Player (JW Player based)
 *      - Multi-audio: Hindi, Tamil, Telugu, Bengali, English, Japanese
 *   2. player1.php iframe with base64-encoded language links
 *      - Each language has a short.icu link → stream
 *
 * M3U8 resolution:
 *   1. GET https://play.zephyrix.top/video/{hash} → get fireplayer_player cookie
 *   2. POST https://play.zephyrix.top/player/index.php?data={hash}&do=getVideo
 *      Body: hash={hash}&r={referer}
 *      → Returns JSON: { videoSource: "https://play.zephyrix.top/cdn/hls/{id}/master.m3u8?..." }
 */

const SITE_BASE = "https://watchanimeworld.top";
const PLAYER_BASE = "https://play.zephyrix.top";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// ─── Types ───────────────────────────────────────────────────────────

export interface WatchAnimeworldEpisode {
  /** Episode URL slug, e.g. "mushoku-tensei-jobless-reincarnation-2x1" */
  slug: string;
  /** Full URL, e.g. "https://watchanimeworld.top/episode/mushoku-tensei-..." */
  url: string;
  /** Season number parsed from slug */
  season: number;
  /** Episode number parsed from slug */
  episode: number;
}

export interface WatchAnimeworldStream {
  /** HLS m3u8 URL */
  m3u8Url: string;
  /** Video thumbnail from CDN */
  thumbnail?: string;
  /** The zephyrix video hash */
  videoHash: string;
}

export interface WatchAnimeworldSearchResult {
  /** Series slug, e.g. "mushoku-tensei-jobless-reincarnation" */
  slug: string;
  /** Full series URL */
  url: string;
  /** Title extracted from the slug */
  title: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function fetchHtml(url: string, referer?: string): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (referer) headers["Referer"] = referer;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, redirect: "follow", cache: "no-store" });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/** Normalize a title for matching: lowercase, remove punctuation, collapse spaces */
function normTitle(t: string): string {
  return t.toLowerCase().replace(/[:',.\-!?]/g, "").replace(/\s+/g, " ").trim();
}

/** Strip "Season N" / "S2" / "Part 2" / "Cour 2" suffixes for search matching */
function stripSeasonSuffix(t: string): string {
  return t
    .replace(/\s*[-:]\s*(season\s*\d+|s\d+|part\s*\d+|cour\s*\d+|final\s+season|the\s+final|final\s+part)\s*$/i, "")
    .replace(/\s+(season\s*\d+|s\d{1,2}|part\s*\d+|cour\s*\d+)\s*$/i, "")
    .trim();
}

/** Parse episode slug like "mushoku-tensei-jobless-reincarnation-2x25" into season/episode */
function parseEpisodeSlug(slug: string): { season: number; episode: number } {
  const m = slug.match(/(\d+)x(\d+)$/i);
  if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
  // Try "ep5" or "episode-5" format
  const m2 = slug.match(/(?:ep|episode)[-.]?(\d+)/i);
  if (m2) return { season: 1, episode: parseInt(m2[1], 10) };
  return { season: 1, episode: 1 };
}

/** Convert a slug to a readable title */
function slugToTitle(slug: string): string {
  return slug
    .replace(/-\d+x\d+$/i, "")  // Remove "2x25"
    .replace(/-/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// ─── Search ──────────────────────────────────────────────────────────

/**
 * Search for an anime series by title.
 * Returns matching series URLs.
 */
export async function searchWatchAnimeworld(
  title: string,
): Promise<WatchAnimeworldSearchResult[]> {
  const query = encodeURIComponent(stripSeasonSuffix(title));
  const html = await fetchHtml(`${SITE_BASE}/?s=${query}&post_type=series`);
  if (!html) return [];

  // Extract series links from search results
  const results: WatchAnimeworldSearchResult[] = [];
  const seen = new Set<string>();
  const pattern = /href=["']((?:https?:)?\/\/(?:www\.)?watchanimeworld\.top\/series\/([^"']+?))\/?["']/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const url = match[1].startsWith("//") ? `https:${match[1]}` : match[1];
    const slug = match[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    results.push({ slug, url, title: slugToTitle(slug) });
  }

  return results;
}

// ─── Episode List ────────────────────────────────────────────────────

/**
 * Get all episodes for a series.
 * Returns episodes sorted by season/episode number.
 */
export async function getWatchAnimeworldEpisodes(
  seriesSlug: string,
): Promise<WatchAnimeworldEpisode[]> {
  const html = await fetchHtml(`${SITE_BASE}/series/${seriesSlug}/`);
  if (!html) return [];

  const episodes: WatchAnimeworldEpisode[] = [];
  const seen = new Set<string>();
  const pattern = /href=["']((?:https?:)?\/\/(?:www\.)?watchanimeworld\.top\/episode\/([^"']+?))\/?["']/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const url = match[1].startsWith("//") ? `https:${match[1]}` : match[1];
    const slug = match[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const { season, episode } = parseEpisodeSlug(slug);
    episodes.push({ slug, url, season, episode });
  }

  // Sort by season then episode
  episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
  return episodes;
}

// ─── Stream Resolution ───────────────────────────────────────────────

/**
 * Get the video hash (zephyrix ID) from an episode page.
 * The episode page contains an iframe like:
 *   https://play.zephyrix.top/video/{hash}
 */
export async function getVideoHashFromEpisode(
  episodeSlug: string,
): Promise<string | null> {
  const html = await fetchHtml(
    `${SITE_BASE}/episode/${episodeSlug}/`,
    `${SITE_BASE}/`,
  );
  if (!html) return null;

  // Find zephyrix player iframe
  const match = html.match(/play\.zephyrix\.top\/video\/([a-f0-9]{32,})/i);
  return match ? match[1] : null;
}

/**
 * Resolve the m3u8 stream URL from the zephyrix player.
 *
 * Two-step process:
 * 1. GET the player page to obtain the fireplayer_player cookie
 * 2. POST to the getVideo API with the cookie to get the m3u8 URL
 */
export async function resolveWatchAnimeworldStream(
  videoHash: string,
): Promise<WatchAnimeworldStream | null> {
  const referer = `${SITE_BASE}/`;
  const videoUrl = `${PLAYER_BASE}/video/${videoHash}`;

  // Step 1: GET the player page to get the session cookie
  let cookie = "";
  try {
    const getRes = await fetch(videoUrl, {
      headers: { "User-Agent": UA, Referer: referer },
      redirect: "follow",
      cache: "no-store",
    });

    // Extract fireplayer_player cookie from Set-Cookie
    const setCookies = getRes.headers.getSetCookie?.() || [];
    for (const sc of setCookies) {
      const m = sc.match(/fireplayer_player=([^;]+)/);
      if (m) { cookie = `fireplayer_player=${m[1]}`; break; }
    }

    // Fallback: try from raw header
    if (!cookie) {
      const rawCookie = getRes.headers.get("set-cookie") || "";
      const m = rawCookie.match(/fireplayer_player=([^;]+)/);
      if (m) cookie = `fireplayer_player=${m[1]}`;
    }
  } catch (e) {
    console.error("[WatchAnimeworld] Failed to get player cookie:", e);
    return null;
  }

  // Step 2: POST to the getVideo API
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    const postRes = await fetch(
      `${PLAYER_BASE}/player/index.php?data=${videoHash}&do=getVideo`,
      {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Referer: videoUrl,
          Origin: PLAYER_BASE,
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "application/x-www-form-urlencoded",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: `hash=${videoHash}&r=${encodeURIComponent(referer)}`,
        signal: controller.signal,
        redirect: "follow",
        cache: "no-store",
      },
    );

    clearTimeout(timer);

    if (!postRes.ok) {
      console.error(`[WatchAnimeworld] getVideo API returned ${postRes.status}`);
      return null;
    }

    const data = await postRes.json();
    const m3u8Url = data?.videoSource || data?.securedLink;
    if (!m3u8Url || typeof m3u8Url !== "string") {
      console.error("[WatchAnimeworld] No videoSource in API response:", JSON.stringify(data).slice(0, 200));
      return null;
    }

    return {
      m3u8Url,
      thumbnail: data?.videoImage || undefined,
      videoHash,
    };
  } catch (e) {
    console.error("[WatchAnimeworld] Failed to resolve stream:", e);
    return null;
  }
}

// ─── Convenience: Full Resolution ────────────────────────────────────

/**
 * Find an anime by title, get the video hash for a specific episode,
 * and resolve the m3u8 stream. All-in-one convenience function.
 */
export async function findAndResolveWatchAnimeworld(
  title: string,
  season: number,
  episode: number,
): Promise<WatchAnimeworldStream | null> {
  // Search for the series
  const results = await searchWatchAnimeworld(title);
  if (results.length === 0) return null;

  // Use the first result (best match)
  const series = results[0];

  // Get episodes
  const episodes = await getWatchAnimeworldEpisodes(series.slug);
  if (episodes.length === 0) return null;

  // Find the matching episode
  const ep = episodes.find(e => e.season === season && e.episode === episode);
  if (!ep) {
    // Try season 1 fallback (some series don't have season numbering in slugs)
    const epFallback = episodes.find(e => e.episode === episode);
    if (epFallback) {
      const hash = await getVideoHashFromEpisode(epFallback.slug);
      if (!hash) return null;
      return resolveWatchAnimeworldStream(hash);
    }
    return null;
  }

  // Get video hash from episode page
  const hash = await getVideoHashFromEpisode(ep.slug);
  if (!hash) return null;

  // Resolve m3u8
  return resolveWatchAnimeworldStream(hash);
}
