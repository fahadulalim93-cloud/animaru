/**
 * animegg.org scraper — anime streaming site.
 *
 * ⚠️ STATUS: Cloudflare-protected. The homepage is reachable from the
 * server, but most other paths (/popular-series, /anime-list.html,
 * /DirectAnimeList, /{slug}) time out from data-center IPs. The site
 * appears to do per-session rate-limiting or active challenge gating.
 *
 * What works server-side:
 *   - GET /                    — homepage (lists recent + upcoming episodes)
 *
 * What works only in a real browser:
 *   - /popular-series          — full A-Z catalog
 *   - /{slug}                  — series detail page
 *   - /{slug}-episode-{N}      — episode page (has embed URL)
 *
 * URL patterns observed from homepage:
 *   - Series: /{slug}                         e.g. /martian-successor-nadesico-the-prince-of-darkness
 *   - Episode: /{slug}-episode-{N}            e.g. /martian-successor-nadesico-the-prince-of-darkness-episode-5
 *
 * Episode embed URL pattern (inferred from similar MegaCloud-based sites
 * that share the same player stack as 4animo):
 *   - https://cdn.animegg.org/embed/hd-1/{id}/{N}/{sub|dub}
 *
 * Strategy:
 *   1. Catalog: scrape the homepage (gives ~30 recent anime). For more,
 *      the user must visit the site in a browser — we cannot bypass CF
 *      from the data center without a real challenge solver.
 *   2. Stream: best-effort — return the watch URL as an iframe embed
 *      for the episode page itself; the user's browser handles the CF
 *      challenge transparently.
 *
 * This module is wired in but the frontend will treat it as a "best-effort"
 * provider — if it returns nothing, other providers cover the gap.
 */

const ANIMEGG_BASE = "https://www.animegg.org";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface AnimeggAnime {
  slug: string;
  title: string;
  url: string;
  poster?: string;
}

export interface AnimeggStreamResult {
  provider: "animegg";
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  serverName: string;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
}

// ─────────────────────────────────────────────────────────────────────
// Fetch helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * animegg.org is Cloudflare-protected. Node.js native fetch works for a few
 * requests then gets blocked (CF rate-limits / challenges the IP after ~5
 * requests). curl with a Chrome User-Agent is more resilient — we use it as
 * the primary transport and fall back to native fetch if curl is unavailable.
 */
async function agFetch(url: string, _timeoutMs = 15000): Promise<string | null> {
  const args = [
    "-sL",
    "--max-time", "15",
    "-A", UA,
    "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-H", `Referer: ${ANIMEGG_BASE}/`,
  ];
  // animegg responds better with gzip encoding
  args.push("-H", "Accept-Encoding: gzip, deflate");
  args.push(url);

  return new Promise((resolve) => {
    try {
      const { execFile } = require("node:child_process");
      execFile("curl", args, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024, timeout: 20000 }, (err: any, stdout: string) => {
        if (err || !stdout || stdout.length < 1000 || stdout.includes("Just a moment")) {
          nativeAgFetch(url).then(resolve);
          return;
        }
        resolve(stdout);
      });
    } catch {
      nativeAgFetch(url).then(resolve);
    }
  });
}

async function nativeAgFetch(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Ch-Ua": '"Chromium";v="120", "Not?A_Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Linux"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        Referer: ANIMEGG_BASE + "/",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Catalog — homepage only (CF blocks other paths from data-center IP)
// ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
let catalogCache: { items: AnimeggAnime[]; fetchedAt: number } | null = null;

/**
 * Fetch the animegg catalog.
 *
 * Tries /popular-series first (the full A-Z catalog page). Falls back to
 * the homepage if /popular-series times out.
 *
 * The slug format is /{slug} (no numeric ID). Slugs are extracted from
 * series-card links like /{slug}.
 */
export async function fetchAnimeggCatalog(force = false): Promise<AnimeggAnime[]> {
  if (!force && catalogCache && Date.now() - catalogCache.fetchedAt < CACHE_TTL_MS) {
    return catalogCache.items;
  }

  // Try the popular-series page (full A-Z catalog)
  let html = await agFetch(`${ANIMEGG_BASE}/popular-series`);

  // Fallback to homepage if popular-series didn't load
  if (!html || html.length < 5000) {
    html = await agFetch(`${ANIMEGG_BASE}/`);
  }
  if (!html) {
    catalogCache = { items: [], fetchedAt: Date.now() };
    return [];
  }

  // Find all series URLs: /{slug}
  // Anime slugs are all-lowercase, at least 4 chars, may contain digits and hyphens.
  // Skip /az-list/, /search, /login, /createUser, /contact, /complaint,
  // /premium-advantage, /new-series, /popular-series, /css, /images, etc.
  // Also skip nav links like /Series, /Releases (capitalized).
  const re = /href="\/([a-z][a-z0-9-]{3,})"/g;
  const slugs = new Set<string>();
  const skip = new Set([
    "az-list", "search", "login", "createuser", "contact", "complaint",
    "premium-advantage", "new-series", "popular-series", "css", "images",
    "static", "api", "embed", "watch", "user", "logout", "register",
    "releases", "release-schedule", "random", "terms-of-service",
    "privacy-policy", "disclaimer", "dmca", "about", "faq", "help",
    "subscribe", "unsubscribe", "feed", "rss", "atom", "sitemap",
    "new-releases", "recent", "schedule", "series", "movies", "ovas",
    "ovas-list", "movies-list", "anime-list", "trending", "top", "all",
    "home", "index", "main",
  ]);
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    // Skip URLs that look like episode URLs (they end with -episode-N)
    if (/-episode-\d+/.test(slug)) {
      // Extract the series slug from the episode URL
      const seriesSlug = slug.replace(/-episode-\d+.*$/, "");
      if (seriesSlug && !skip.has(seriesSlug) && seriesSlug.length >= 4) slugs.add(seriesSlug);
      continue;
    }
    // Skip the special paths
    if (skip.has(slug)) continue;
    // Skip if it has a hash fragment
    if (slug.includes("#")) continue;
    // Skip very short slugs (likely nav links)
    if (slug.length < 4) continue;
    slugs.add(slug);
  }

  const items: AnimeggAnime[] = Array.from(slugs).map((slug) => ({
    slug,
    title: slugToTitle(slug),
    url: `${ANIMEGG_BASE}/${slug}`,
  }));

  catalogCache = { items, fetchedAt: Date.now() };
  return items;
}

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// ─────────────────────────────────────────────────────────────────────
// Stream resolution (best-effort)
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve stream URLs for one episode.
 *
 * Fetches the episode page server-side and extracts the embed URL from
 * the player iframe. Falls back to returning the episode page URL itself
 * as an iframe embed (the user's browser handles playback).
 */
export async function resolveAnimeggStreams(
  slug: string,
  episode: number,
  types: Array<"sub" | "dub"> = ["sub", "dub"]
): Promise<AnimeggStreamResult[]> {
  const results: AnimeggStreamResult[] = [];
  const episodeUrl = `${ANIMEGG_BASE}/${slug}-episode-${episode}`;

  // Try to fetch the episode page and extract the embed URL
  const html = await agFetch(episodeUrl);
  let embedUrl: string | null = null;

  if (html) {
    // Look for iframe src containing the embed player
    // Common patterns: <iframe src="https://cdn.animegg.org/embed/...">
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeMatch) {
      embedUrl = iframeMatch[1].replace(/&amp;/g, "&");
    }
    // Also try the video-source data attribute pattern
    if (!embedUrl) {
      const dataMatch = html.match(/data-(?:video|src|embed|source)=["']([^"']+)["']/i);
      if (dataMatch) embedUrl = dataMatch[1];
    }
  }

  for (const type of types) {
    // Use the embed URL if we found one, otherwise fall back to the episode page
    const streamUrl = embedUrl || episodeUrl;
    results.push({
      provider: "animegg",
      type,
      quality: "1080p",
      streamUrl,
      isM3U8: false,
      isMP4: false,
      isEmbed: true,
      serverName: type === "dub" ? "Animegg Dub" : "Animegg Sub",
      subtitleTracks: [],
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────

export async function searchAnimegg(query: string): Promise<AnimeggAnime[]> {
  const all = await fetchAnimeggCatalog();
  const q = query.toLowerCase().trim();
  if (!q) return all;
  return all.filter((a) => a.title.toLowerCase().includes(q) || a.slug.includes(q.replace(/\s+/g, "-")));
}
