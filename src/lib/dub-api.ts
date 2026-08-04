// Multi-Language Dubbed Anime API
// Based on https://github.com/PrathmeshGOAT/anime-api
// Scrapes toonstream.vip and animesalt.ac for Hindi/Tamil/Telugu/Malayalam/Kannada/Bengali/Marathi dubs

const BASE_V1 = "https://animesalt.ac";
const BASE_V1_ALT = "https://animesalt.top";
const BASE_V5 = "https://toonstream.vip";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ---- Types ----

export interface DubAnimeItem {
  title: string;
  anime_id: string;
  poster?: string;
  season?: string;
  episode?: string;
  language?: string;
  quality?: string;
  year?: string;
  rating?: string;
}

export interface DubAnimeInfo {
  title: string;
  anime_id: string;
  poster?: string;
  overview?: string;
  language?: string;
  quality?: string;
  runningTime?: string;
  genres?: string[];
  year?: string;
  seasons?: string;
  episodes?: string;
  rating?: string;
}

export interface DubEpisodeItem {
  title: string;
  season: string;
  episode: string;
  image?: string;
}

export interface DubStreamServer {
  server: string;
  embed: string;
}

export interface DubMovieStream {
  iframe: string;
}

export interface DubHomePage {
  fresh_drops: DubAnimeItem[];
  latest_animeMovies: DubAnimeItem[];
  mostWatched_Films: DubAnimeItem[];
  mostWatched_Series: DubAnimeItem[];
  on_air_series: DubAnimeItem[];
}

// ---- Helper: Fetch and parse HTML ----

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: HEADERS,
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} for ${url}`);
  return res.text();
}

// Simple HTML parser helpers (no cheerio dependency - use regex & string ops)
function extractBetween(html: string, start: string, end: string): string[] {
  const results: string[] = [];
  let pos = 0;
  while (true) {
    const s = html.indexOf(start, pos);
    if (s === -1) break;
    const e = html.indexOf(end, s + start.length);
    if (e === -1) break;
    results.push(html.slice(s + start.length, e));
    pos = e + end.length;
  }
  return results;
}

function extractAttr(html: string, tag: string, attr: string): string {
  const regex = new RegExp(`${tag}[^>]*${attr}=["']([^"']*)["']`, "i");
  const m = html.match(regex);
  return m ? m[1] : "";
}

function extractText(html: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const m = html.match(regex);
  return m ? m[1].trim() : "";
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// ---- API Functions ----

/** Home page - fresh drops, latest movies, most watched, on-air */
export async function getDubHomePage(): Promise<DubHomePage> {
  try {
    // Fetch from animesalt.ac for fresh drops and most watched
    const [v1Html, v1AltHtml] = await Promise.all([
      fetchHtml(`${BASE_V1}`).catch(() => ""),
      fetchHtml(`${BASE_V1_ALT}`).catch(() => ""),
    ]);

    const fresh_drops = parseAnimeSaltCards(v1Html, ".fresh-drops, .latest-episodes, section");
    const mostWatched_Films = parseAnimeSaltCards(v1Html, ".most-watched-films, section");
    const mostWatched_Series = parseAnimeSaltCards(v1Html, ".most-watched-series, section");
    const latest_animeMovies = parseAnimeSaltCards(v1AltHtml, ".latest-movies, section");
    const on_air_series = parseAnimeSaltCards(v1AltHtml, ".on-air, section");

    return { fresh_drops, latest_animeMovies, mostWatched_Films, mostWatched_Series, on_air_series };
  } catch {
    return { fresh_drops: [], latest_animeMovies: [], mostWatched_Films: [], mostWatched_Series: [], on_air_series: [] };
  }
}

/** Search anime on toonstream */
export async function searchDubAnime(s: string, page: number = 1): Promise<{
  results: DubAnimeItem[];
  currentPage: number;
  totalPages: number;
}> {
  try {
    const html = await fetchHtml(`${BASE_V5}/page/${page}/?s=${encodeURIComponent(s)}`);
    const results = parseToonStreamSearch(html);
    const totalPages = extractTotalPages(html);
    return { results, currentPage: page, totalPages };
  } catch {
    return { results: [], currentPage: 1, totalPages: 1 };
  }
}

/** Anime info from toonstream */
export async function getDubAnimeInfo(id: string): Promise<DubAnimeInfo | null> {
  try {
    // Try series/{id} first
    let html = await fetchHtml(`${BASE_V5}/series/${id}/`).catch(() => "");
    if (!html || html.includes("404") || html.length < 500) {
      html = await fetchHtml(`${BASE_V5}/series/${id}`).catch(() => "");
    }

    const title = extractMetaContent(html, "og:title") || extractText(html, "h1") || id;
    const poster = extractMetaContent(html, "og:image") || extractAttr(html, "img", "src");
    const overview = extractMetaContent(html, "og:description") || "";

    // Extract detailed info from the page
    const language = extractDetailField(html, "Language") || extractDetailField(html, "language");
    const quality = extractDetailField(html, "Quality") || extractDetailField(html, "quality");
    const runningTime = extractDetailField(html, "Runtime") || extractDetailField(html, "Running Time");
    const year = extractDetailField(html, "Year") || extractDetailField(html, "First Air Date");
    const seasons = extractDetailField(html, "Seasons") || extractDetailField(html, "Season");
    const episodes = extractDetailField(html, "Episodes") || extractDetailField(html, "Episode");
    const rating = extractDetailField(html, "Rating") || extractDetailField(html, "TMDb");

    // Extract genres
    const genres = extractGenres(html);

    return {
      title: decodeHtmlEntities(title.replace(" - ToonStream", "").replace(" | ToonStream", "")),
      anime_id: id,
      poster,
      overview: decodeHtmlEntities(overview),
      language,
      quality,
      runningTime,
      genres,
      year,
      seasons,
      episodes,
      rating,
    };
  } catch {
    return null;
  }
}

/** Episodes list from toonstream */
export async function getDubEpisodes(
  id: string,
  season: number = 1
): Promise<{
  totalSeasons: string;
  seasons: { season: string; text: string }[];
  episodes: DubEpisodeItem[];
}> {
  try {
    const html = await fetchHtml(`${BASE_V5}/episode/${id}-${season}x1`).catch(() => "");
    if (!html) return { totalSeasons: "1", seasons: [], episodes: [] };

    // Extract season selectors
    const seasonLinks = extractBetween(html, 'class="season', '</a>');
    const seasons = seasonLinks.map((s, i) => ({
      season: String(i + 1),
      text: s.replace(/<[^>]*>/g, "").trim() || `Season ${i + 1}`,
    }));
    const totalSeasons = String(seasons.length || 1);

    // Extract episodes
    const epCards = extractBetween(html, 'class="ep-', "</div>");
    const episodes: DubEpisodeItem[] = [];

    for (const card of epCards) {
      const epTitle = card.replace(/<[^>]*>/g, "").trim();
      const epMatch = epTitle.match(/(\d+)/);
      const epNum = epMatch ? epMatch[1] : "1";
      const imgMatch = card.match(/src=["']([^"']*)["']/);
      const image = imgMatch ? imgMatch[1] : undefined;

      episodes.push({
        title: decodeHtmlEntities(epTitle) || `Episode ${epNum}`,
        season: String(season),
        episode: epNum,
        image,
      });
    }

    // If regex parsing didn't find episodes, try alternative pattern
    if (episodes.length === 0) {
      const allEpMatches = [...html.matchAll(/episode[^>]*>[\s\S]*?(\d+)[\s\S]*?<\/a>/gi)];
      for (const match of allEpMatches) {
        episodes.push({
          title: `Episode ${match[1]}`,
          season: String(season),
          episode: match[1],
        });
      }
    }

    // Generate episode list if we know total count but couldn't parse individual episodes
    if (episodes.length === 0) {
      const epCountMatch = html.match(/Episodes?[:\s]*(\d+)/i);
      const count = epCountMatch ? parseInt(epCountMatch[1]) : 24;
      for (let i = 1; i <= Math.min(count, 200); i++) {
        episodes.push({
          title: `Episode ${i}`,
          season: String(season),
          episode: String(i),
        });
      }
    }

    return { totalSeasons, seasons, episodes };
  } catch {
    return { totalSeasons: "1", seasons: [], episodes: [] };
  }
}

/** Stream links for an episode */
export async function getDubStream(
  id: string,
  season: number,
  ep: number
): Promise<DubStreamServer[]> {
  try {
    const html = await fetchHtml(`${BASE_V5}/episode/${id}-${season}x${ep}`).catch(() => "");
    if (!html) return [];

    // Extract server options from video divs
    const servers: DubStreamServer[] = [];

    // Method 1: Find video options divs
    const optionDivs = extractBetween(html, 'id="aa-options"', '</div></div>');
    for (const div of optionDivs) {
      const iframes = extractBetween(div, '<iframe', '></iframe>');
      for (let i = 0; i < iframes.length; i++) {
        const src = iframes[i].match(/src=["']([^"']*)["']/);
        if (src && src[1]) {
          // Resolve nested iframes
          const resolved = await resolveIframe(src[1]);
          servers.push({
            server: `Server ${i + 1}`,
            embed: resolved || src[1],
          });
        }
      }
    }

    // Method 2: Find all iframes in video player section
    if (servers.length === 0) {
      const videoSection = extractBetween(html, 'class="video-player', '</aside>');
      for (const section of videoSection) {
        const iframes = [...section.matchAll(/<iframe[^>]+src=["']([^"']*)["']/gi)];
        for (let i = 0; i < iframes.length; i++) {
          const src = iframes[i][1];
          if (src && !src.includes("about:blank")) {
            const resolved = await resolveIframe(src);
            servers.push({
              server: `Server ${i + 1}`,
              embed: resolved || src,
            });
          }
        }
      }
    }

    // Method 3: Find any iframe with video-related src
    if (servers.length === 0) {
      const allIframes = [...html.matchAll(/<iframe[^>]+src=["']([^"']*)["']/gi)];
      for (const match of allIframes) {
        const src = match[1];
        if (
          src &&
          !src.includes("about:blank") &&
          !src.includes("google.com") &&
          !src.includes("facebook.com") &&
          (src.includes("embed") || src.includes("video") || src.includes("stream") || src.includes("player") || src.includes("cdn"))
        ) {
          const resolved = await resolveIframe(src);
          servers.push({
            server: `Server ${servers.length + 1}`,
            embed: resolved || src,
          });
        }
      }
    }

    return servers;
  } catch {
    return [];
  }
}

/** Movie details + stream links */
export async function getDubMovie(id: string): Promise<{
  info: DubAnimeInfo | null;
  streams: DubMovieStream[];
}> {
  try {
    // Try multiple URL patterns
    let html = "";
    for (const pattern of [`/movies/${id}/`, `/movies/${id}`, `/${id}/`, `/${id}`]) {
      html = await fetchHtml(`${BASE_V5}${pattern}`).catch(() => "");
      if (html && !html.includes("404") && html.length > 500) break;
    }

    if (!html) return { info: null, streams: [] };

    // Parse movie info
    const title = extractMetaContent(html, "og:title") || id;
    const poster = extractMetaContent(html, "og:image") || "";
    const overview = extractMetaContent(html, "og:description") || "";
    const language = extractDetailField(html, "Language") || extractDetailField(html, "language");
    const quality = extractDetailField(html, "Quality") || extractDetailField(html, "quality");
    const runTime = extractDetailField(html, "Runtime") || extractDetailField(html, "Running Time");
    const year = extractDetailField(html, "Year");
    const rating = extractDetailField(html, "Rating") || extractDetailField(html, "TMDb");
    const genres = extractGenres(html);

    const info: DubAnimeInfo = {
      title: decodeHtmlEntities(title.replace(" - ToonStream", "").replace(" | ToonStream", "")),
      anime_id: id,
      poster,
      overview: decodeHtmlEntities(overview),
      language,
      quality,
      runningTime: runTime,
      genres,
      year,
      rating,
    };

    // Extract streams
    const streams: DubMovieStream[] = [];
    const videoSection = extractBetween(html, 'class="video-player', '</aside>');
    for (const section of videoSection) {
      const iframes = [...section.matchAll(/<iframe[^>]+src=["']([^"']*)["']/gi)];
      for (const match of iframes) {
        const src = match[1];
        if (src && !src.includes("about:blank")) {
          const resolved = await resolveIframe(src);
          streams.push({ iframe: resolved || src });
        }
      }
    }

    // Fallback: find all iframes
    if (streams.length === 0) {
      const allIframes = [...html.matchAll(/<iframe[^>]+src=["']([^"']*)["']/gi)];
      for (const match of allIframes) {
        const src = match[1];
        if (src && !src.includes("about:blank") && !src.includes("google.com") && !src.includes("facebook.com")) {
          const resolved = await resolveIframe(src);
          streams.push({ iframe: resolved || src });
        }
      }
    }

    return { info, streams };
  } catch {
    return { info: null, streams: [] };
  }
}

/** Movies list */
export async function getDubMovies(page: number = 1): Promise<{
  results: DubAnimeItem[];
  currentPage: number;
  totalPages: number;
}> {
  try {
    const html = await fetchHtml(`${BASE_V5}/movies/page/${page}/`);
    const results = parseToonStreamCards(html);
    const totalPages = extractTotalPages(html);
    return { results, currentPage: page, totalPages };
  } catch {
    return { results: [], currentPage: 1, totalPages: 1 };
  }
}

/** Series list */
export async function getDubSeries(page: number = 1): Promise<{
  results: DubAnimeItem[];
  currentPage: number;
  totalPages: number;
}> {
  try {
    const html = await fetchHtml(`${BASE_V5}/series/page/${page}/`);
    const results = parseToonStreamCards(html);
    const totalPages = extractTotalPages(html);
    return { results, currentPage: page, totalPages };
  } catch {
    return { results: [], currentPage: 1, totalPages: 1 };
  }
}

/** New added episodes */
export async function getDubNewAdded(): Promise<DubAnimeItem[]> {
  try {
    const html = await fetchHtml(`${BASE_V5}`);
    return parseNewAddedEpisodes(html);
  } catch {
    return [];
  }
}

// ---- Internal Parsers ----

function parseAnimeSaltCards(html: string, _selector: string): DubAnimeItem[] {
  if (!html) return [];
  const items: DubAnimeItem[] = [];

  // Find article/card elements
  const articles = extractBetween(html, "<article", "</article>");
  for (const art of articles) {
    const titleMatch = art.match(/<a[^>]*title=["']([^"']*)["']/i) || art.match(/<h[^>]*>([^<]*)</i);
    const hrefMatch = art.match(/href=["']([^"']*?)["']/i);
    const imgMatch = art.match(/src=["']([^"']*?)["']/i);

    if (titleMatch || hrefMatch) {
      let animeId = "";
      if (hrefMatch) {
        const href = hrefMatch[1];
        const idMatch = href.match(/\/(?:series|movies|episode)\/([^/?#]+)/);
        animeId = idMatch ? idMatch[1] : href.replace(/\/$/, "").split("/").pop() || "";
      }

      items.push({
        title: decodeHtmlEntities(titleMatch ? titleMatch[1] : animeId),
        anime_id: animeId,
        poster: imgMatch ? imgMatch[1] : undefined,
      });
    }
  }

  return items;
}

function parseToonStreamSearch(html: string): DubAnimeItem[] {
  const items: DubAnimeItem[] = [];
  const articles = extractBetween(html, "<article", "</article>");

  for (const art of articles) {
    const titleMatch = art.match(/title=["']([^"']*)["']/i) || art.match(/<h[^>]*>([^<]*)</i);
    const hrefMatch = art.match(/href=["']([^"']*?)["']/i);
    const imgMatch = art.match(/src=["']([^"']*?)["']/i);

    let animeId = "";
    if (hrefMatch) {
      const href = hrefMatch[1];
      const idMatch = href.match(/\/(?:series|movies)\/([^/?#]+)/);
      animeId = idMatch ? idMatch[1] : href.replace(/\/$/, "").split("/").pop() || "";
    }

    if (animeId || titleMatch) {
      items.push({
        title: decodeHtmlEntities(titleMatch ? titleMatch[1] : animeId),
        anime_id: animeId,
        poster: imgMatch ? imgMatch[1] : undefined,
      });
    }
  }

  return items;
}

function parseToonStreamCards(html: string): DubAnimeItem[] {
  const items: DubAnimeItem[] = [];
  const articles = extractBetween(html, "<article", "</article>");

  for (const art of articles) {
    const titleMatch = art.match(/title=["']([^"']*)["']/i) || art.match(/<h[^>]*><a[^>]*>([^<]*)</i);
    const hrefMatch = art.match(/href=["']([^"']*?)["']/i);
    const imgMatch = art.match(/src=["']([^"']*?)["']/i);
    const qualityMatch = art.match(/quality[^>]*>([^<]*)</i) || art.match(/class=["'].*?quality.*?["'][^>]*>([^<]*)</i);

    let animeId = "";
    if (hrefMatch) {
      const href = hrefMatch[1];
      const idMatch = href.match(/\/(?:series|movies)\/([^/?#]+)/);
      animeId = idMatch ? idMatch[1] : href.replace(/\/$/, "").split("/").pop() || "";
    }

    if (animeId || titleMatch) {
      items.push({
        title: decodeHtmlEntities(titleMatch ? titleMatch[1] : animeId),
        anime_id: animeId,
        poster: imgMatch ? imgMatch[1] : undefined,
        quality: qualityMatch ? qualityMatch[1].trim() : undefined,
      });
    }
  }

  return items;
}

function parseNewAddedEpisodes(html: string): DubAnimeItem[] {
  const items: DubAnimeItem[] = [];
  // Find episode entries
  const epLinks = [...html.matchAll(/href=["']([^"']*episode[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  for (const match of epLinks) {
    const href = match[1];
    const text = match[2].replace(/<[^>]*>/g, "").trim();

    const idMatch = href.match(/episode\/([^/?#]+)/);
    const animeId = idMatch ? idMatch[1] : href.replace(/\/$/, "").split("/").pop() || "";

    // Try to extract season/episode from the ID
    const seasonEpMatch = animeId.match(/-(\d+)x(\d+)$/);
    const season = seasonEpMatch ? seasonEpMatch[1] : undefined;
    const episode = seasonEpMatch ? seasonEpMatch[2] : undefined;

    items.push({
      title: decodeHtmlEntities(text) || animeId,
      anime_id: animeId.replace(/-\d+x\d+$/, ""),
      season,
      episode,
    });
  }

  return items;
}

function extractTotalPages(html: string): number {
  const match = html.match(/class=["']pages["'][^>]*>.*?(\d+)/s) ||
    html.match(/page\/(\d+)["']/g);
  if (match) {
    if (match[0] && match[1]) return parseInt(match[1]);
    // Find the max page number from all page links
    const pageLinks = html.match(/page\/(\d+)/g) || [];
    let maxPage = 1;
    for (const pl of pageLinks) {
      const num = parseInt(pl.replace("page/", ""));
      if (num > maxPage) maxPage = num;
    }
    return maxPage;
  }
  return 1;
}

function extractMetaContent(html: string, property: string): string {
  const regex = new RegExp(`<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']*)["']`, "i");
  const m = html.match(regex);
  if (m) return m[1];
  const regex2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${property}["']`, "i");
  const m2 = html.match(regex2);
  return m2 ? m2[1] : "";
}

function extractDetailField(html: string, label: string): string {
  // Try multiple patterns
  const patterns = [
    new RegExp(`${label}[:\\s]*</span>\\s*<span[^>]*>([^<]*)</span>`, "i"),
    new RegExp(`${label}[:\\s]*</[^>]+>\\s*<[^>]+>([^<]*)</`, "i"),
    new RegExp(`<strong>${label}</strong>[:\\s]*([^<]*)</`, "i"),
    new RegExp(`${label}[:\\s]*([\\dA-Za-z\\s,\\-|p]+)`, "i"),
    new RegExp(`<td>${label}</td>\\s*<td>([^<]*)</td>`, "i"),
  ];

  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1].trim()) return m[1].trim();
  }
  return "";
}

function extractGenres(html: string): string[] {
  const genres: string[] = [];
  // Find genre links
  const genreLinks = [...html.matchAll(/href=["'][^"']*\/category\/[^"']*["'][^>]*>([^<]*)<\/a>/gi)];
  for (const match of genreLinks) {
    const genre = match[1].trim();
    if (genre) genres.push(decodeHtmlEntities(genre));
  }

  // Alternative: find genre from labels
  if (genres.length === 0) {
    const genreMatch = html.match(/Genres?[:\\s]*<\/[^>]*>([\s\S]*?)<\/div>/i);
    if (genreMatch) {
      const genreAnchors = [...genreMatch[1].matchAll(/>([^<]+)<\/a>/g)];
      for (const ga of genreAnchors) {
        if (ga[1].trim()) genres.push(decodeHtmlEntities(ga[1].trim()));
      }
    }
  }

  return genres;
}

/** Resolve nested iframes - follow the iframe to get the final embed URL */
async function resolveIframe(url: string): Promise<string | null> {
  try {
    // Only follow if it looks like a proxied/redirect URL
    if (
      url.includes("embed") ||
      url.includes("player") ||
      url.includes("stream") ||
      url.includes("video") ||
      url.includes("cdn")
    ) {
      // Check if it's already a direct embed URL from a known player
      if (
        url.includes("rubystm.com") ||
        url.includes("vidmoly.net") ||
        url.includes("turbovid") ||
        url.includes("strmup.to") ||
        url.includes("cloudy.upns") ||
        url.includes("gdmirrorbot") ||
        url.includes("as-cdn") ||
        url.includes("short.icu")
      ) {
        return url;
      }

      // Try to follow the iframe and find nested iframes/video sources
      const res = await fetch(url, {
        headers: HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      const html = await res.text();

      // Look for nested iframe
      const nestedIframe = html.match(/<iframe[^>]+src=["']([^"']*)["']/i);
      if (nestedIframe && nestedIframe[1]) {
        const nestedSrc = nestedIframe[1];
        if (nestedSrc.startsWith("http")) return nestedSrc;
        // Resolve relative URL
        const baseUrl = new URL(url);
        return `${baseUrl.origin}${nestedSrc.startsWith("/") ? "" : "/"}${nestedSrc}`;
      }

      // Look for video source
      const videoSrc = html.match(/<source[^>]+src=["']([^"']*)["']/i);
      if (videoSrc && videoSrc[1]) {
        return videoSrc[1];
      }
    }

    return url;
  } catch {
    // If we can't resolve, return the original URL
    return url;
  }
}

/** Supported languages for filter UI - deduplicated */
export const DUB_LANGUAGES = [...new Set([
  "Hindi",
  "Tamil",
  "Telugu",
  "Malayalam",
  "Kannada",
  "Bengali",
  "Marathi",
  "English",
  "Japanese",
  "Korean",
  "Chinese",
  "Fan Hindi",
])] as const;

export type DubLanguage = (typeof DUB_LANGUAGES)[number];
