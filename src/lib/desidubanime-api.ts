/**
 * DesiDubAnime API Client
 * -----------------------
 * DesiDubAnime (https://www.desidubanime.me) is a Hindi/Tamil/Telugu dubbed
 * anime streaming site built on WordPress with the Kiranime Pro theme.
 *
 * It exposes a full WordPress REST API at /wp-json/kiranime/v1/ with endpoints
 * for search, anime info, episodes, auth, and watchlists.
 *
 * STREAMING ARCHITECTURE:
 *   Each episode has multiple embed servers (Server 1, Server 2, Server 3, Server 4).
 *   - Servers 1-3 are typically third-party embed hosts (VidStreaming, StreamTape, etc.)
 *   - Server 4 is the "self-host" option — direct video URL or self-hosted embed
 *     configured by the site admin with their own hosted files.
 *
 * API flow for watching an episode:
 *   1. Search: GET /wp-json/kiranime/v1/anime/search?query={title}
 *      → Returns list of anime posts with IDs, titles, metadata
 *   2. Anime detail: GET the anime page /anime/{slug}/
 *      → Parse HTML to extract episode list with server embed URLs
 *   3. Episode watch: GET /watch/{slug}-episode-{num}/
 *      → Parse HTML to extract multi-server video sources (Server 1-4)
 *   4. Server 4 (self-host): Direct video URL or self-hosted embed
 *      → Can be MP4 or HLS, playable directly without proxy
 *
 * No authentication required for browsing/streaming.
 * User auth (login/register) only needed for watchlist/voting features.
 */

const DESIDUB_BASE = "https://www.desidubanime.me";
const DESIDUB_API = `${DESIDUB_BASE}/wp-json/kiranime/v1`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Use our CF worker proxy for requests to desidubanime.me (Cloudflare-protected)
const WORKER_BASE = process.env.NEXT_PUBLIC_PROXY_BASE || "https://api.luffytv.live";

// =====================================================
// TYPES
// =====================================================

export interface DesiDubAnimeSearchResult {
  id: number;
  title: string;
  slug: string;
  poster: string;
  type: string;        // "TV", "Movie", "OVA", etc.
  status: string;      // "Completed", "Ongoing", etc.
  rating: string;
  language: string[];  // ["Hindi"], ["Tamil"], ["Telugu"], etc.
  genres: string[];
  studio: string;
  totalEpisodes: number;
}

export interface DesiDubEpisode {
  number: number;
  title: string;
  slug: string;
  url: string;          // Watch page URL: /watch/{slug}-episode-{num}/
  servers: DesiDubServer[];
}

export interface DesiDubServer {
  name: string;         // "Server 1", "Server 2", "Server 3", "Server 4"
  url: string;          // Embed URL or direct video URL
  isSelfHost: boolean;  // true for Server 4 (self-hosted)
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  language: string;     // "Hindi", "Tamil", "Telugu"
}

export interface DesiDubAnimeInfo {
  id: number;
  title: string;
  slug: string;
  poster: string;
  backdrop: string;
  synopsis: string;
  type: string;
  status: string;
  rating: string;
  language: string[];
  genres: string[];
  studio: string;
  totalEpisodes: number;
  episodes: DesiDubEpisode[];
}

export interface DesiDubStreamResult {
  id: string;
  name: string;
  source: "desidub";
  serverName: string;
  isSelfHost: boolean;
  language: string;
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  priority: number;
}

// =====================================================
// PROXY HELPER
// =====================================================

/**
 * Fetch a URL through our CF worker proxy to bypass Cloudflare protection.
 */
async function proxyFetch(url: string, options?: RequestInit): Promise<Response> {
  // For DesiDubAnime, route through our proxy worker
  const proxyUrl = `${WORKER_BASE}/proxy?url=${encodeURIComponent(url)}&ref=${encodeURIComponent(DESIDUB_BASE + "/")}`;
  return fetch(proxyUrl, {
    ...options,
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      ...(options?.headers || {}),
    },
    cache: "no-store",
  });
}

// =====================================================
// SEARCH
// =====================================================

/**
 * Search DesiDubAnime by title using the WordPress REST API.
 *
 * Strategy:
 *   1. Try /anime/title endpoint (returns proper JSON array)
 *   2. Fall back to /anime/search endpoint (may return HTML in {result: "..."})
 *      — parse the HTML to extract slugs and titles
 */
export async function desidubSearch(
  query: string
): Promise<DesiDubAnimeSearchResult[]> {
  if (!query.trim()) return [];

  // ── Strategy 1: /anime/title endpoint (returns JSON) ──
  try {
    const titleResults = await desidubSearchTitles(query, "anime");
    if (titleResults.length > 0) return titleResults;
  } catch { /* fall through */ }

  // ── Strategy 2: /anime/search endpoint (may return HTML) ──
  try {
    const url = `${DESIDUB_API}/anime/search?query=${encodeURIComponent(query)}`;
    const res = await proxyFetch(url);

    if (!res.ok) {
      console.error(`[DesiDub] search failed: ${res.status}`);
      return [];
    }

    const data = await res.json();

    // JSON array format
    if (Array.isArray(data)) {
      return data.map(normalizeSearchResult);
    }

    // Wrapped formats
    if (data?.data && Array.isArray(data.data)) {
      return data.data.map(normalizeSearchResult);
    }
    if (data?.posts && Array.isArray(data.posts)) {
      return data.posts.map(normalizeSearchResult);
    }

    // HTML-in-JSON format: { result: "<html>..." }
    // The Kiranime theme returns search results as HTML links.
    // Parse the HTML to extract anime slugs and titles.
    if (data?.result && typeof data.result === "string") {
      return parseSearchHtml(data.result);
    }

    return [];
  } catch (err) {
    console.error("[DesiDub] search error:", err);
    return [];
  }
}

/**
 * Lighter title search — GET /wp-json/kiranime/v1/anime/title?query={q}&type={t}
 */
export async function desidubSearchTitles(
  query: string,
  type: string = "anime"
): Promise<DesiDubAnimeSearchResult[]> {
  try {
    const url = `${DESIDUB_API}/anime/title?query=${encodeURIComponent(query)}&type=${type}`;
    const res = await proxyFetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data.map(normalizeSearchResult);
    return [];
  } catch (err) {
    console.error("[DesiDub] title search error:", err);
    return [];
  }
}

// =====================================================
// ANIME INFO + EPISODES
// =====================================================

/**
 * Fetch anime detail page and parse episodes with server embed URLs.
 *
 * We scrape the anime detail page HTML to extract:
 *   - Episode list with slugs/URLs
 *   - Per-episode server embed URLs (Server 1-4)
 *
 * The Kiranime theme stores episode data in a JavaScript variable
 * on the page: `var animeData = { ... }` or in structured JSON-LD.
 *
 * @param slug  The anime slug (from search results)
 */
export async function desidubGetAnimeInfo(
  slug: string
): Promise<DesiDubAnimeInfo | null> {
  try {
    const url = `${DESIDUB_BASE}/anime/${slug}/`;
    const res = await proxyFetch(url);
    if (!res.ok) {
      console.error(`[DesiDub] anime page failed: ${res.status}`);
      return null;
    }

    const html = await res.text();
    return parseAnimePage(html, slug);
  } catch (err) {
    console.error("[DesiDub] anime info error:", err);
    return null;
  }
}

/**
 * Fetch a specific episode's watch page and extract multi-server sources.
 *
 * The watch page at /watch/{slug}-episode-{num}/ contains:
 *   - A video player with multiple server tabs
 *   - Each server tab has an embed URL or direct video URL
 *   - Server 4 is the self-hosted option (direct MP4/HLS)
 *
 * @param slug      Anime slug
 * @param episode   Episode number
 */
export async function desidubGetEpisodeServers(
  slug: string,
  episode: number
): Promise<DesiDubServer[]> {
  try {
    const url = `${DESIDUB_BASE}/watch/${slug}-episode-${episode}/`;
    const res = await proxyFetch(url);
    if (!res.ok) {
      console.error(`[DesiDub] episode page failed: ${res.status}`);
      return [];
    }

    const html = await res.text();
    return parseEpisodeServers(html);
  } catch (err) {
    console.error("[DesiDub] episode servers error:", err);
    return [];
  }
}

// =====================================================
// SERVER 4 SELF-HOST RESOLVER
// =====================================================

/**
 * Get the Server 4 (self-hosted) stream for an episode.
 *
 * Server 4 is the admin-configured self-hosted video that typically
 * uses a direct MP4 or HLS URL. This is preferred over embed servers
 * because it's a direct stream that can be played without iframes.
 *
 * Falls back to Server 3/2/1 if Server 4 is not available.
 *
 * @param slug      Anime slug
 * @param episode   Episode number
 * @param preferSelfHost  If true, only return Server 4 (default: true)
 */
export async function desidubResolveServer4(
  slug: string,
  episode: number,
  preferSelfHost: boolean = true
): Promise<DesiDubStreamResult | null> {
  const servers = await desidubGetEpisodeServers(slug, episode);
  if (servers.length === 0) return null;

  // Try Server 4 (self-host) first
  const server4 = servers.find((s) => s.isSelfHost);
  if (server4) {
    return {
      id: `desidub:${slug}:ep${episode}:server4`,
      name: "DesiDub Server 4 (Self-Host)",
      source: "desidub",
      serverName: "Server 4",
      isSelfHost: true,
      language: server4.language || "Hindi",
      quality: "1080p",
      streamUrl: server4.url,
      isM3U8: server4.isM3U8,
      isMP4: server4.isMP4,
      isEmbed: server4.isEmbed,
      priority: 1.0, // Highest priority — self-hosted is most reliable
    };
  }

  // If we only want self-host and it's not available, return null
  if (preferSelfHost) return null;

  // Fallback: try other servers in order (Server 3, 2, 1)
  for (const server of servers) {
    if (!server.isSelfHost) {
      return {
        id: `desidub:${slug}:ep${episode}:${server.name.replace(/\s/g, "").toLowerCase()}`,
        name: `DesiDub ${server.name} (Hindi)`,
        source: "desidub",
        serverName: server.name,
        isSelfHost: false,
        language: server.language || "Hindi",
        quality: "1080p",
        streamUrl: server.url,
        isM3U8: server.isM3U8,
        isMP4: server.isMP4,
        isEmbed: server.isEmbed,
        priority: 0.8,
      };
    }
  }

  return null;
}

/**
 * Resolve ALL available servers for an episode, with Server 4 (self-host) first.
 */
export async function desidubResolveAllServers(
  slug: string,
  episode: number
): Promise<DesiDubStreamResult[]> {
  const servers = await desidubGetEpisodeServers(slug, episode);

  return servers.map((server, idx) => ({
    id: `desidub:${slug}:ep${episode}:${server.name.replace(/\s/g, "").toLowerCase()}`,
    name: server.isSelfHost
      ? `DesiDub ${server.name} (Self-Host)`
      : `DesiDub ${server.name} (Hindi)`,
    source: "desidub" as const,
    serverName: server.name,
    isSelfHost: server.isSelfHost,
    language: server.language || "Hindi",
    quality: "1080p",
    streamUrl: server.url,
    isM3U8: server.isM3U8,
    isMP4: server.isMP4,
    isEmbed: server.isEmbed,
    priority: server.isSelfHost ? 1.0 : 0.8 - idx * 0.1,
  }));
}

// =====================================================
// CROSS-REFERENCE: Find DesiDub slug by AniList title
// =====================================================

/**
 * Search DesiDubAnime by anime title (from AniList) to find
 * the matching slug for cross-referencing.
 */
export async function desidubFindByTitle(
  title: string
): Promise<DesiDubAnimeSearchResult | null> {
  const results = await desidubSearch(title);
  if (results.length === 0) return null;

  // Exact match
  const exact = results.find(
    (r) => r.title.toLowerCase() === title.toLowerCase()
  );
  if (exact) return exact;

  // Partial match (first result)
  return results[0];
}

// =====================================================
// HTML PARSERS
// =====================================================

/**
 * Parse the anime detail page HTML to extract anime info + episode list.
 *
 * The Kiranime theme renders episode data in one of these formats:
 *   1. JSON-LD structured data in <script type="application/ld+json">
 *   2. JavaScript variable: var animeData = {...}
 *   3. HTML episode list with data attributes
 */
function parseAnimePage(html: string, slug: string): DesiDubAnimeInfo | null {
  try {
    // Extract title from <title> or og:title
    const titleMatch =
      html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/) ||
      html.match(/<title>([^<]+)/);
    const title = titleMatch ? decodeHTMLEntities(titleMatch[1].trim()) : slug;

    // Extract poster from og:image
    const posterMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
    const poster = posterMatch ? posterMatch[1] : "";

    // Extract synopsis from og:description
    const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/);
    const synopsis = descMatch ? decodeHTMLEntities(descMatch[1]) : "";

    // Extract episode list from the page
    // Kiranime renders episodes as links: /watch/{slug}-episode-{num}/
    const episodes: DesiDubEpisode[] = [];
    const epRegex = /href="[^"]*\/watch\/([^"]+)-episode-(\d+)\/[^"]*"/gi;
    let match;

    while ((match = epRegex.exec(html)) !== null) {
      const epSlug = match[1];
      const epNum = parseInt(match[2], 10);
      if (!isNaN(epNum)) {
        episodes.push({
          number: epNum,
          title: `Episode ${epNum}`,
          slug: epSlug,
          url: `${DESIDUB_BASE}/watch/${epSlug}-episode-${epNum}/`,
          servers: [], // Servers are resolved on the watch page
        });
      }
    }

    // Sort episodes by number
    episodes.sort((a, b) => a.number - b.number);

    // Extract genres from meta or page content
    const genres: string[] = [];
    const genreRegex = /genre[^>]*>([^<]+)</gi;
    while ((match = genreRegex.exec(html)) !== null) {
      const g = match[1].trim();
      if (g && !genres.includes(g)) genres.push(g);
    }

    return {
      id: 0, // WordPress post ID not available from HTML alone
      title,
      slug,
      poster,
      backdrop: poster,
      synopsis,
      type: episodes.length === 1 ? "Movie" : "TV",
      status: "Ongoing",
      rating: "",
      language: ["Hindi"],
      genres,
      studio: "",
      totalEpisodes: episodes.length,
      episodes,
    };
  } catch (err) {
    console.error("[DesiDub] parse anime page error:", err);
    return null;
  }
}

/**
 * Parse the episode watch page HTML to extract multi-server video sources.
 *
 * The Kiranime theme renders servers in several ways:
 *   1. Server tabs with data-src attributes: <div class="server" data-src="url">
 *   2. Iframe sources: <iframe src="embed_url">
 *   3. Video sources in JS variables: var playerData = {...}
 *
 * Server 4 (self-host) is identified by:
 *   - Label containing "Server 4", "Self Host", "HD-2", or "Direct"
 *   - URL pointing to a direct MP4/M3U8 file (not an embed domain)
 */
function parseEpisodeServers(html: string): DesiDubServer[] {
  const servers: DesiDubServer[] = [];

  try {
    // Strategy 0: Extract from data-embed-id attributes (Kiranime Pro v2+)
    // Format: data-embed-id="BASE64(NAME):BASE64(CONTENT)"
    // CONTENT can be:
    //   - A direct URL (e.g., https://gdmirrorbot.nl/embed/x8gze0k)
    //   - An HTML iframe snippet (e.g., <iframe src='...' ...></iframe>)
    //   - An HTML div wrapping an iframe
    // Also check the element's textContent for the server label (e.g., "CLOUD [No Ads]")
    const embedIdRegex = /data-embed-id="([^"]+)"[^>]*>([^<]*)</gi;
    let match;

    while ((match = embedIdRegex.exec(html)) !== null) {
      const rawValue = match[1];
      const textLabel = match[2].trim();

      // Split on first colon: "BASE64_NAME:BASE64_CONTENT"
      const colonIdx = rawValue.indexOf(":");
      if (colonIdx === -1) continue;

      const b64Name = rawValue.substring(0, colonIdx);
      const b64Content = rawValue.substring(colonIdx + 1);

      // Decode server name from base64
      let serverName = "";
      try {
        serverName = Buffer.from(b64Name, "base64").toString("utf-8");
      } catch { /* invalid base64, skip */ }
      if (!serverName) continue;

      // Decode content from base64
      let content = "";
      try {
        content = Buffer.from(b64Content, "base64").toString("utf-8");
      } catch { /* invalid base64, skip */ }
      if (!content) continue;

      // Extract URL from content — could be a direct URL or an iframe snippet
      let url = "";
      let isEmbed = false;
      let isM3U8 = false;
      let isMP4 = false;

      // Try to extract iframe src from the decoded content (case-insensitive)
      const srcMatch = content.match(/(?:src|SRC)=['"]([^'"]+)['"]/i);

      if (srcMatch) {
        // Content is an HTML snippet with an iframe — extract the URL
        url = srcMatch[1];
        isEmbed = true;
      } else if (content.startsWith("http://") || content.startsWith("https://")) {
        // Content is a direct URL
        url = content;
        isM3U8 = url.includes(".m3u8");
        isMP4 = url.includes(".mp4");
        isEmbed = !isM3U8 && !isMP4;
      } else if (content.startsWith("/")) {
        // Relative URL — resolve against base
        url = `${DESIDUB_BASE}${content}`;
        isM3U8 = url.includes(".m3u8");
        isMP4 = url.includes(".mp4");
        isEmbed = !isM3U8 && !isMP4;
      } else {
        // Unknown format — try as-is
        url = content;
        isEmbed = true;
      }

      if (!url) continue;

      // Use text label if available (e.g., "CLOUD [No Ads]"), otherwise decoded name
      const label = textLabel || serverName;
      const isSelfHost = isSelfHostServer(label, url);

      servers.push({
        name: label,
        url,
        isSelfHost,
        isM3U8,
        isMP4,
        isEmbed: isSelfHost ? false : isEmbed,
        language: "Hindi",
      });
    }

    // Strategy 1: Extract from data-src attributes on server buttons (older Kiranime)
    // Kiranime renders: <button class="server" data-src="URL">Server N</button>
    const dataSrcRegex = /data-src="([^"]+)"[^>]*>([^<]*)</gi;
    let srcMatch;

    while ((srcMatch = dataSrcRegex.exec(html)) !== null) {
      const url = srcMatch[1];
      const label = srcMatch[2].trim();
      if (!url || url === "#") continue;

      const serverNum = extractServerNumber(label);
      const isSelfHost = isSelfHostServer(label, url);

      servers.push({
        name: label || `Server ${serverNum}`,
        url,
        isSelfHost,
        isM3U8: url.includes(".m3u8"),
        isMP4: url.includes(".mp4"),
        isEmbed: !isSelfHost && !url.includes(".m3u8") && !url.includes(".mp4"),
        language: "Hindi",
      });
    }

    // Strategy 2: Extract from iframe sources
    // <iframe src="embed_url" ...>
    if (servers.length === 0) {
      const iframeRegex = /<iframe[^>]+src="([^"]+)"/gi;
      while ((srcMatch = iframeRegex.exec(html)) !== null) {
        const url = srcMatch[1];
        if (!url || url.startsWith("data:") || url.includes("about:")) continue;

        servers.push({
          name: `Server ${servers.length + 1}`,
          url,
          isSelfHost: false,
          isM3U8: false,
          isMP4: false,
          isEmbed: true,
          language: "Hindi",
        });
      }
    }

    // Strategy 3: Extract from JavaScript variable
    // var playerData = { sources: [...] }
    if (servers.length === 0) {
      const jsVarRegex = /var\s+playerData\s*=\s*(\{[\s\S]*?\});/;
      const jsMatch = html.match(jsVarRegex);
      if (jsMatch) {
        try {
          const playerData = JSON.parse(jsMatch[1]);
          if (playerData.sources && Array.isArray(playerData.sources)) {
            for (let i = 0; i < playerData.sources.length; i++) {
              const src = playerData.sources[i];
              const url = src.file || src.src || src.url || "";
              if (!url) continue;

              const label = src.label || `Server ${i + 1}`;
              const isSelfHost = isSelfHostServer(label, url);

              servers.push({
                name: label,
                url,
                isSelfHost,
                isM3U8: url.includes(".m3u8") || src.type === "hls",
                isMP4: url.includes(".mp4") || src.type === "video/mp4",
                isEmbed: !isSelfHost && !url.includes(".m3u8") && !url.includes(".mp4"),
                language: "Hindi",
              });
            }
          }
        } catch { /* invalid JSON, ignore */ }
      }
    }

    // Strategy 4: Extract from JSON-LD or embedded JSON
    if (servers.length === 0) {
      const jsonLdRegex = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
      while ((srcMatch = jsonLdRegex.exec(html)) !== null) {
        try {
          const jsonLd = JSON.parse(srcMatch[1]);
          // Check for VideoObject with contentUrl
          if (jsonLd.contentUrl) {
            servers.push({
              name: "Server 1",
              url: jsonLd.contentUrl,
              isSelfHost: true,
              isM3U8: jsonLd.contentUrl.includes(".m3u8"),
              isMP4: jsonLd.contentUrl.includes(".mp4"),
              isEmbed: false,
              language: "Hindi",
            });
          }
        } catch { /* invalid JSON-LD, ignore */ }
      }
    }
  } catch (err) {
    console.error("[DesiDub] parse episode servers error:", err);
  }

  // Re-index server names if they don't have proper names
  servers.forEach((s, i) => {
    if (!s.name || s.name === "Server 0") {
      s.name = `Server ${i + 1}`;
    }
  });

  return servers;
}

// =====================================================
// HELPERS
// =====================================================

/**
 * Determine if a server is the self-hosted one (Server 4).
 *
 * Identifiers:
 *   - Label contains: "Server 4", "Self Host", "Self-Host", "HD-2", "Direct", "DServer4"
 *   - URL is a direct video file (not an embed domain like streamtape.com, etc.)
 */
function isSelfHostServer(label: string, url: string): boolean {
  const l = label.toLowerCase();
  const selfHostLabels = [
    "server 4", "self host", "self-host", "hd-2", "direct",
    "dserver4", "selfhost", "self_host",
  ];

  if (selfHostLabels.some((kw) => l.includes(kw))) {
    return true;
  }

  // "CLOUD" is a self-hosted embed wrapper (cloud.desidubanime.me/external/)
  // It contains an iframe to the actual player — treat as embed, not direct stream

  // Check if URL looks like a direct video file (not an embed)
  const embedDomains = [
    "streamtape", "doodstream", "mixdrop", "mp4upload",
    "vidstreaming", "gogoserver", "filemoon", "streamlare",
    "voe", "rabbitstream", "rapidcloud",
    "gdmirrorbot", "abyssplayer", "p2pplay", "rubyvidhub",
  ];

  const urlLower = url.toLowerCase();
  const isEmbedDomain = embedDomains.some((d) => urlLower.includes(d));
  const isDirectVideo =
    urlLower.includes(".mp4") ||
    urlLower.includes(".m3u8") ||
    urlLower.includes(".mkv");

  return isDirectVideo && !isEmbedDomain;
}

/**
 * Extract server number from a label like "Server 4", "HD-2", etc.
 */
function extractServerNumber(label: string): number {
  const m = label.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Normalize a search result from the WordPress REST API.
 * The API returns various formats depending on the theme version.
 */
function normalizeSearchResult(item: any): DesiDubAnimeSearchResult {
  // WordPress post format: { id, title: { rendered: "..." }, meta: { ... } }
  // or flat format: { id, title, slug, ... }
  const title =
    typeof item.title === "string"
      ? item.title
      : item.title?.rendered || "";

  const meta = item.meta || {};
  const slug = item.slug || item.post_name || "";

  // Extract poster from featured_image or meta
  const poster =
    item.featured_image ||
    item.thumbnail ||
    item.poster ||
    meta.kiranime_anime_poster ||
    "";

  // Extract language array
  const language: string[] = [];
  if (meta.kiranime_anime_lang) {
    if (Array.isArray(meta.kiranime_anime_lang)) {
      language.push(...meta.kiranime_anime_lang);
    } else if (typeof meta.kiranime_anime_lang === "string") {
      language.push(meta.kiranime_anime_lang);
    }
  }
  if (language.length === 0) language.push("Hindi"); // Default for DesiDub

  // Extract genres
  const genres: string[] = [];
  if (meta.kiranime_anime_genres) {
    if (Array.isArray(meta.kiranime_anime_genres)) {
      genres.push(...meta.kiranime_anime_genres);
    }
  }

  return {
    id: item.id || 0,
    title: decodeHTMLEntities(title.replace(/<[^>]+>/g, "").trim()),
    slug,
    poster,
    type: meta.kiranime_anime_type || item.type || "TV",
    status: meta.kiranime_anime_status || item.status || "",
    rating: meta.kiranime_anime_rating || "",
    language,
    genres,
    studio: meta.kiranime_anime_studio || "",
    totalEpisodes: parseInt(meta.kiranime_anime_episode || "0", 10) || 0,
  };
}

/**
 * Decode common HTML entities.
 */
function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Parse HTML search results from the Kiranime theme.
 *
 * The /anime/search endpoint returns: { result: "<a href='.../anime/slug/' ...>...<span>Title</span>...</a>..." }
 * We extract the slug from the href and the English title from the first <span> in each link.
 */
function parseSearchHtml(html: string): DesiDubAnimeSearchResult[] {
  const results: DesiDubAnimeSearchResult[] = [];

  try {
    // Split by <a href= to get individual result blocks
    const linkRegex = /href="([^"]*\/anime\/([^\/]+)\/?)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      const slug = match[2];
      const content = match[3];

      // Extract English title: typically the first <span> inside the link
      // The Kiranime theme shows: <span>English Title</span><span>Romaji Title</span>
      const spanRegex = /<span[^>]*>([^<]+)<\/span>/gi;
      const spans: string[] = [];
      let spanMatch;
      while ((spanMatch = spanRegex.exec(content)) !== null) {
        spans.push(decodeHTMLEntities(spanMatch[1].trim()));
      }

      // Use the first span as the title (English title is shown first)
      const title = spans[0] || slug.replace(/-/g, " ");

      // Extract poster from <img> tag
      const imgMatch = content.match(/src=['"]([^'"]+)['"]/);
      const poster = imgMatch ? imgMatch[1] : "";

      if (title && slug) {
        results.push({
          id: 0,
          title,
          slug,
          poster,
          type: "TV",
          status: "",
          rating: "",
          language: ["Hindi"],
          genres: [],
          studio: "",
          totalEpisodes: 0,
        });
      }
    }
  } catch (err) {
    console.error("[DesiDub] parseSearchHtml error:", err);
  }

  return results;
}
