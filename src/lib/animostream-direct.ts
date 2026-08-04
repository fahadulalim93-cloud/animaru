/**
 * AnimoStream scraper — Hindi-dubbed anime streaming site (Blogger blog).
 *
 * LIVE domain: animostream.com (animostream.xyz is closed)
 * Blog ID: 5949363413389926579
 *
 * Site structure:
 *   - Catalog: Blogger Atom feed at /feeds/posts/default?alt=json&max-results=500
 *     Returns ~50 anime posts (each post = one anime series or movie).
 *     Pagination via ?start-index=N (Blogger API).
 *   - When video embeds are active, each post HTML contains a <script> with
 *     `var animeData = {...}` containing seasons, episodes, and per-server
 *     embed URLs:
 *       { "s1": { "episodes": ["1","2",...],
 *                 "abyss":      ["https://abyssplayer.com/{id}", ...],
 *                 "streamtape": ["https://animostream.embedseek.online/#code", ...],
 *                 "doodstream": [...] (optional),
 *                 "mixdrop":    [...] (optional),
 *                 "mp4upload":  [...] (optional) } }
 *   - The post also has a poster image (blogger.googleusercontent.com)
 *     and Dual/Multi Audio info ([Hindi ORG, ENG] WEB-DL 720p HEVC).
 *   - Embed CDNs (all iframe-able):
 *       abyssplayer.com/{id}                  — SoTrym player (own m3u8)
 *       animostream.embedseek.online/#{code}  — streamtape-backed proxy
 *       doodstream, mixdrop, mp4upload        — standard embeds (if present)
 *
 * Categories in the feed: Action, Adventure, Comedy, Drama, Movies, Series,
 * Most Popular, Most Favourite, Trending, Top Airing, Ghibli Movies,
 * Doraemon Movies, etc. — plus letter tags A-Z.
 *
 * All content is Hindi-dubbed by default (the site is Hindi-first).
 */

const ANIMOSTREAM_BASE = "https://www.animostream.com";
const FEED_URL = `${ANIMOSTREAM_BASE}/feeds/posts/default`;
const BLOGGER_FEED_URL = "https://www.blogger.com/feeds/5949363413389926579/posts/default";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface AnimoStreamAnime {
  postId: string;          // Blogger post ID (numeric)
  url: string;             // post URL
  title: string;
  poster: string;          // blogger.googleusercontent.com image
  publishedAt: string;
  updatedAt: string;
  categories: string[];    // genre + letter + type tags
  isMovie: boolean;        // true if tagged "Movies"
  isSeries: boolean;       // true if tagged "Series"
  audioInfo?: string;      // e.g. "Dual/Multi Audio [Hindi ORG, ENG] WEB-DL 720p HEVC"
  seasons: Array<{
    id: string;            // "s1", "s2", ...
    episodes: string[];    // episode numbers as strings
    servers: Record<string, string[]>; // serverName -> [url per episode]
  }>;
  totalEpisodes: number;
}

export interface AnimoStreamStreamResult {
  provider: "animostream";
  type: "dub";             // always Hindi dub on this site
  quality: string;
  streamUrl: string;       // embed URL (iframe-able)
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  serverName: string;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
  season: string;
  episode: number;
}

// ─────────────────────────────────────────────────────────────────────
// Fetch helpers
// ─────────────────────────────────────────────────────────────────────

async function asFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "identity",
      },
      redirect: "follow",
      next: { revalidate: 600 },
    });
    if (!res.ok) {
      console.log(`[AnimoStream] HTTP ${res.status} for ${url}`);
      return null;
    }
    const html = await res.text();
    if (html.includes("Site Permanently Closed")) return null;
    return html;
  } catch {
    return null;
  }
}

/**
 * Fetch via z-ai page_reader proxy (fallback for Cloudflare-blocked pages).
 */
async function asFetchProxy(url: string): Promise<string | null> {
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const result = await zai.functions.invoke("page_reader", { url });
    if (result.data?.html) return result.data.html;
    return null;
  } catch (err) {
    console.error("[AnimoStream] proxy fetch failed:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Catalog — fetch all Hindi-dubbed anime from the Blogger feed
// ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
let catalogCache: { items: AnimoStreamAnime[]; fetchedAt: number } | null = null;

/**
 * Fetch the full animostream catalog (240+ Hindi-dubbed anime).
 * Paginates through the Blogger Atom feed.
 *
 * Returns basic info per anime (title, poster, categories) — does NOT
 * fetch the per-post `animeData` script. Use fetchAnimoStreamDetail()
 * for that (called lazily when the user opens an anime).
 */
export async function fetchAnimoStreamCatalog(force = false): Promise<AnimoStreamAnime[]> {
  if (!force && catalogCache && Date.now() - catalogCache.fetchedAt < CACHE_TTL_MS) {
    return catalogCache.items;
  }

  const items: AnimoStreamAnime[] = [];
  const seen = new Set<string>();

  // Paginate — Blogger caps at 150 per page despite asking for 500
  let startIndex = 1;
  const maxResults = 150;
  let totalResults = Infinity;
  let emptyPages = 0;

  while (startIndex <= totalResults && startIndex < 2000 && emptyPages < 2) {
    // Try both the site feed and the direct Blogger API feed
    const feedUrls = [
      `${FEED_URL}?alt=json&max-results=${maxResults}&start-index=${startIndex}`,
      `${BLOGGER_FEED_URL}?alt=json&max-results=${maxResults}&start-index=${startIndex}`,
    ];

    let data: any = null;
    for (const url of feedUrls) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": UA,
            Accept: "application/json, text/plain, */*",
          },
          next: { revalidate: 600 },
        });
        if (res.ok) {
          data = await res.json();
          break;
        }
      } catch {
        // Try next URL
      }
    }
    if (!data) break;

    const feed = data.feed || {};
    totalResults = parseInt(feed?.openSearch$totalResults?.$t || "0", 10);
    const entries = feed.entry || [];

    if (entries.length === 0) {
      emptyPages++;
      startIndex += maxResults;
      continue;
    }

    for (const e of entries) {
      const postId = (e.id?.$t || "").split("-").pop() || "";
      if (!postId || seen.has(postId)) continue;
      seen.add(postId);

      const link = (e.link || []).find((l: any) => l.rel === "alternate");
      const url = link?.href || "";
      const title = e.title?.$t || "Untitled";
      const poster = e.media$thumbnail?.url?.replace(/\/s\d+-c\//, "/s400/") || "";
      const publishedAt = e.published?.$t || "";
      const updatedAt = e.updated?.$t || "";
      const categories = (e.category || []).map((c: any) => c.term);

      // Audio info — first <div style="display: none;"> in content
      const content = e.content?.$t || "";
      const audioMatch = content.match(/<div style="display:\s*none;">([^<]+)<\/div>/);
      const audioInfo = audioMatch ? audioMatch[1].trim() : undefined;

      // Fix URLs from .xyz → .com (the feed may contain old .xyz URLs)
      const fixedUrl = url.replace("animostream.xyz", "animostream.com");

      items.push({
        postId,
        url: fixedUrl,
        title,
        poster,
        publishedAt,
        updatedAt,
        categories,
        isMovie: categories.includes("Movies"),
        isSeries: categories.includes("Series"),
        audioInfo,
        seasons: [],
        totalEpisodes: 0,
      });
    }

    startIndex += maxResults;
    if (entries.length < maxResults) break;
  }

  catalogCache = { items, fetchedAt: Date.now() };
  return items;
}

// ─────────────────────────────────────────────────────────────────────
// Detail — fetch one anime's full episode + server map
// ─────────────────────────────────────────────────────────────────────

let detailCache: Map<string, { data: AnimoStreamAnime; fetchedAt: number }> = new Map();

export async function fetchAnimoStreamDetail(postIdOrUrl: string): Promise<AnimoStreamAnime | null> {
  // Check cache
  const cached = detailCache.get(postIdOrUrl);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  // Look up the catalog entry first (gives us title, poster, categories)
  const catalog = await fetchAnimoStreamCatalog();
  const catalogEntry = catalog.find((a) => a.postId === postIdOrUrl || a.url === postIdOrUrl);

  // Determine the URL to fetch — fix .xyz → .com
  const url = (postIdOrUrl.startsWith("http") ? postIdOrUrl.replace("animostream.xyz", "animostream.com") : (catalogEntry?.url || `${ANIMOSTREAM_BASE}/p/${postIdOrUrl}.html`));
  if (!url) return null;

  // Fetch the post page — try direct, then proxy fallback
  let html: string | null = null;

  // Step 1: Try direct fetch
  html = await asFetch(url);

  // Step 2: If direct fails, try z-ai proxy
  if (!html) {
    html = await asFetchProxy(url);
  }

  // Step 3: Try the Blogger feed content (strips <script> but has poster + audio info)
  if (!html && catalogEntry) {
    const feedUrls = [
      `${FEED_URL}?alt=json&max-results=500`,
      `${BLOGGER_FEED_URL}?alt=json&max-results=500`,
    ];
    for (const feedUrl of feedUrls) {
      try {
        const feedRes = await fetch(feedUrl, {
          headers: { "User-Agent": UA, Accept: "application/json" },
          next: { revalidate: 600 },
        }).then((r) => r.json());
        if (feedRes) {
          const entry = (feedRes.feed?.entry || []).find((e: any) => {
            const id = (e.id?.$t || "").split("-").pop();
            return id === postIdOrUrl;
          });
          if (entry) html = entry.content?.$t || null;
          if (html) break;
        }
      } catch {
        // Try next
      }
    }
  }
  if (!html) return null;

  // Parse the animeData JSON
  const seasons = parseAnimeData(html);
  const totalEpisodes = seasons.reduce((sum, s) => sum + s.episodes.length, 0);

  const anime: AnimoStreamAnime = {
    postId: catalogEntry?.postId || postIdOrUrl,
    url: catalogEntry?.url || url,
    title: catalogEntry?.title || "Untitled",
    poster: catalogEntry?.poster || "",
    publishedAt: catalogEntry?.publishedAt || "",
    updatedAt: catalogEntry?.updatedAt || "",
    categories: catalogEntry?.categories || [],
    isMovie: catalogEntry?.isMovie ?? false,
    isSeries: catalogEntry?.isSeries ?? false,
    audioInfo: catalogEntry?.audioInfo,
    seasons,
    totalEpisodes,
  };

  detailCache.set(postIdOrUrl, { data: anime, fetchedAt: Date.now() });
  return anime;
}

interface RawAnimeData {
  [seasonId: string]: {
    episodes: string[];
    [serverName: string]: string[] | string; // each server has one URL per episode
  };
}

function parseAnimeData(html: string): AnimoStreamAnime["seasons"] {
  // Find: var animeData = { ... };
  const m = html.match(/var\s+animeData\s*=\s*(\{[\s\S]*?\});\s*\n/);
  if (!m) {
    // Try without trailing semicolon (some posts use just `var animeData = {...}`)
    const m2 = html.match(/var\s+animeData\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
    if (!m2) return [];
    return parseSeasonsFromJson(m2[1]);
  }
  return parseSeasonsFromJson(m[1]);
}

function parseSeasonsFromJson(jsonStr: string): AnimoStreamAnime["seasons"] {
  try {
    // The JSON is valid (Blogger escapes quotes/HTML — but the script body
    // is inside CDATA-free <script>, so quotes are usually literal)
    // Strip trailing commas (JS allows them, JSON doesn't)
    const cleaned = jsonStr.replace(/,(\s*[}\]])/g, "$1");
    const raw: RawAnimeData = JSON.parse(cleaned);

    const seasons: AnimoStreamAnime["seasons"] = [];
    for (const [seasonId, seasonData] of Object.entries(raw)) {
      const episodes = (seasonData.episodes || []).map(String);
      const servers: Record<string, string[]> = {};
      for (const [key, val] of Object.entries(seasonData)) {
        if (key === "episodes") continue;
        if (Array.isArray(val)) {
          servers[key] = val.map(String);
        }
      }
      seasons.push({ id: seasonId, episodes, servers });
    }
    // Sort seasons by id (s1, s2, ...)
    seasons.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    return seasons;
  } catch (e) {
    console.error("[AnimoStream] parseAnimeData failed:", (e as Error).message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────
// Stream resolution
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve stream URLs for one episode.
 *
 * Iterates every server in the anime's animeData and returns one stream
 * per server. The episode index is 1-based and matches the `episodes`
 * array position in animeData.
 */
export async function resolveAnimoStreamStreams(
  postIdOrUrl: string,
  episode: number,
  seasonId: string = "s1"
): Promise<AnimoStreamStreamResult[]> {
  const anime = await fetchAnimoStreamDetail(postIdOrUrl);
  if (!anime) return [];

  const season = anime.seasons.find((s) => s.id === seasonId);
  if (!season) return [];

  // Find the episode index — episodes array might be ["1","2",...] or ["01","02",...]
  const epIdx = season.episodes.findIndex((e) => parseInt(e, 10) === episode);
  if (epIdx === -1) return [];

  const results: AnimoStreamStreamResult[] = [];

  for (const [serverName, urls] of Object.entries(season.servers)) {
    const url = urls[epIdx];
    if (!url || url === "about:blank") continue;

    results.push({
      provider: "animostream",
      type: "dub",
      quality: serverQuality(serverName),
      streamUrl: url,
      isM3U8: false,
      isMP4: false,
      isEmbed: true,
      serverName: serverDisplayName(serverName),
      subtitleTracks: [], // Hindi dub — no subtitles needed
      season: seasonId,
      episode,
    });
  }

  return results;
}

function serverDisplayName(server: string): string {
  const map: Record<string, string> = {
    abyss: "Abyss",
    streamtape: "StreamTape",
    doodstream: "Doodstream",
    mixdrop: "MixDrop",
    mp4upload: "Mp4Upload",
    streamwish: "StreamWish",
    filelions: "FileLions",
    animehub: "AnimeHub",
  };
  return map[server.toLowerCase()] || server.charAt(0).toUpperCase() + server.slice(1);
}

function serverQuality(server: string): string {
  const map: Record<string, string> = {
    abyss: "1080p",
    streamtape: "720p",
    doodstream: "720p",
    mixdrop: "720p",
    mp4upload: "1080p",
    streamwish: "1080p",
    filelions: "1080p",
  };
  return map[server.toLowerCase()] || "720p";
}

// ─────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────

export async function searchAnimoStream(query: string): Promise<AnimoStreamAnime[]> {
  const all = await fetchAnimoStreamCatalog();
  const q = query.toLowerCase().trim();
  if (!q) return all;
  // Normalize: strip punctuation + collapse whitespace (so a query like
  // "That Time I Got Reincarnated as a Slime" matches catalog entries that
  // store "That Time I Got Reincarnated As A Slime" with different case/punct)
  const normalize = (s: string) => s.toLowerCase().replace(/[:'".,!?]/g, "").replace(/\s+/g, " ").trim();
  const qNorm = normalize(q);
  // Match if either the normalized title CONTAINS the normalized query OR
  // the query CONTAINS the normalized title (handles cases where the query
  // has extra context like "Season 4" that the catalog entry doesn't have)
  return all.filter((a) => {
    const tNorm = normalize(a.title);
    return tNorm.includes(qNorm) || qNorm.includes(tNorm);
  });
}
