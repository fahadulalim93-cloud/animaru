/**
 * 4animo.xyz scraper — anime streaming site (Cloudflare-protected episode pages,
 * but catalog + detail + embed URL discovery all work server-side).
 *
 * Site structure:
 *   - Catalog: /az-list/All (or /az-list/{letter}) — server-rendered with all
 *     anime links as /{slug}-{id}
 *   - Detail: /{slug}-{id} — Next.js RSC payload contains full metadata
 *     (title, alt titles, synopsis, genres, status, type, episode count,
 *     sub/dub counts, score, season, year)
 *   - Watch URL: /watch/{slug}-{id}?ep={N} — server-rendered with embed URL
 *   - Embed URL: https://cdn.4animo.xyz/embed/hd-1/{id}/{N}/{sub|dub}
 *   - Sources API: https://cdn.4animo.xyz/stream/getSources?hd=1&id={id}&episode={N}&type={sub|dub}
 *     Returns JSON: { sources:[{file:"/p/vp?t=...",type:"hls"}], tracks:[...],
 *                     intro:{start,end}, outro:{start,end}, encrypted:false, server:1 }
 *   - The /p/vp?t=... path is Cloudflare-protected server-side, so we return
 *     the embed URL as an iframe embed (the browser handles the CF challenge).
 *
 * Catalog images:
 *   - Poster: https://cdnanimo.xyz/poster/{id}.jpg
 *   - Banner: https://cdnanimo.xyz/banner/{id}.jpg
 *   - Episode thumb: https://cdnanimo.xyz/episode/{epId}.jpg
 */

const ANIMO4_BASE = "https://4animo.xyz";
const ANIMO4_CDN = "https://cdn.4animo.xyz";
const ANIMO4_IMG = "https://cdnanimo.xyz";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface Animo4Anime {
  id: number;
  slug: string;          // URL slug (e.g. "demon-slayer-kimetsu-no-yaiba-9411")
  title: string;
  poster: string;        // https://cdnanimo.xyz/poster/{id}.jpg
  banner?: string;
  synopsis?: string;
  genres?: string[];
  type?: string;         // "TV" | "Movie" | "OVA" | ...
  status?: string;       // "FINISHED" | "RELEASING" | ...
  year?: number;
  season?: string;
  totalEpisodes?: number;
  subEpisodes?: number;
  dubEpisodes?: number;
  score?: number;
  duration?: number;             // minutes per episode
  alternativeTitles?: string[];
  studios?: string[];
  producers?: string[];
  anilistIdFromMeta?: number;    // AniList ID extracted from <meta name="anilist-id">
  malId?: number;                // MAL ID extracted from <meta name="mal-id">
}

export interface Animo4StreamResult {
  provider: "animo4";
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;       // embed URL (iframe-able)
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  serverName: string;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
}

// ─────────────────────────────────────────────────────────────────────
// Fetch helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Cloudflare-protected fetch via curl child_process.
 *
 * Node.js's native fetch fails TLS fingerprinting on 4animo.xyz (returns
 * 403). curl with a Chrome User-Agent passes through cleanly. We use
 * execFileSync so it works in both Vercel Node.js runtime and local dev.
 *
 * For runtime environments where curl is unavailable (e.g. edge runtime),
 * we fall back to native fetch.
 */
function animoFetch(url: string, referer?: string): Promise<string | null> {
  // Build curl command
  const args = [
    "-sL",
    "--max-time", "20",
    "-A", UA,
    "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-H", "Accept-Encoding: identity",
  ];
  if (referer) {
    args.push("-e", referer);
  }
  args.push(url);

  return new Promise((resolve) => {
    try {
      const { execFile } = require("node:child_process");
      execFile("curl", args, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024, timeout: 25000 }, (err: any, stdout: string) => {
        if (err || !stdout || stdout.length < 1000 || stdout.includes("Just a moment")) {
          // Fallback to native fetch
          nativeFetch(url, referer).then(resolve);
          return;
        }
        resolve(stdout);
      });
    } catch {
      nativeFetch(url, referer).then(resolve);
    }
  });
}

async function nativeFetch(url: string, referer?: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "identity",
        ...(referer ? { Referer: referer } : {}),
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Catalog — fetch all anime from /az-list/All
// ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
let catalogCache: { items: Animo4Anime[]; fetchedAt: number } | null = null;

/**
 * Fetch the full 4animo catalog (300+ anime).
 * Uses /az-list/All which returns all anime in a single HTML page.
 */
export async function fetchAnimo4Catalog(force = false): Promise<Animo4Anime[]> {
  if (!force && catalogCache && Date.now() - catalogCache.fetchedAt < CACHE_TTL_MS) {
    return catalogCache.items;
  }

  const items: Animo4Anime[] = [];
  const seen = new Set<number>();

  // Fetch all letter pages SEQUENTIALLY (parallel requests trigger CF rate-limit).
  // The /az-list/All page alone contains the full catalog (~500 anime), but
  // we also fetch A-Z + 0-9 in case /All is incomplete.
  const letters = ["All"];
  for (let c = 65; c <= 90; c++) letters.push(String.fromCharCode(c));
  letters.push("0-9");

  for (const letter of letters) {
    const path = letter === "All" ? "All" : encodeURIComponent(letter);
    const html = await animoFetch(`${ANIMO4_BASE}/az-list/${path}`);
    if (!html) continue;

    // Find all /{slug}-{numericId} links that point to anime detail pages
    // Pattern: href="/{slug}-{id}" — slug is lowercase kebab, id is 1-5 digits
    const re = /href="\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?-(\d{1,6}))"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const slug = m[1];
      const id = parseInt(m[2], 10);
      if (!id || seen.has(id)) continue;
      // Skip /az-list/ and other non-anime links
      if (slug.startsWith("az-list-") || slug.startsWith("anime-")) continue;
      seen.add(id);
      items.push({
        id,
        slug,
        title: slugToTitle(slug, id),
        poster: `${ANIMO4_IMG}/poster/${id}.jpg`,
        banner: `${ANIMO4_IMG}/banner/${id}.jpg`,
      });
    }

    // /az-list/All already contains everything — stop after it
    if (letter === "All" && items.length >= 100) break;
  }

  // Enrich top items with metadata (in batches to avoid hammering)
  // Only fetch detail pages for the first 50 most-recent items to keep startup fast.
  // Remaining items will lazily fetch metadata when the user opens them.
  catalogCache = { items, fetchedAt: Date.now() };
  return items;
}

function slugToTitle(slug: string, _id: number): string {
  // Strip trailing "-{id}" then title-case the slug
  const stripped = slug.replace(/-\d+$/, "");
  return stripped
    .split("-")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// ─────────────────────────────────────────────────────────────────────
// Detail — fetch full metadata for one anime
// ─────────────────────────────────────────────────────────────────────

let detailCache: Map<number, { data: Animo4Anime; fetchedAt: number }> = new Map();

export async function fetchAnimo4Detail(id: number, slug: string): Promise<Animo4Anime | null> {
  const cached = detailCache.get(id);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  const html = await animoFetch(`${ANIMO4_BASE}/${slug}`);
  if (!html) return null;

  // Parse metadata directly from the HTML (meta tags + RSC payload rows)
  const meta = parseAnimeMeta(html);

  const anime: Animo4Anime = {
    id,
    slug,
    title: meta.title || slugToTitle(slug, id),
    poster: `${ANIMO4_IMG}/poster/${id}.jpg`,
    banner: `${ANIMO4_IMG}/banner/${id}.jpg`,
    synopsis: meta.synopsis,
    genres: meta.genres,
    type: meta.type,
    status: meta.status,
    year: meta.year,
    season: meta.season,
    totalEpisodes: meta.totalEpisodes,
    subEpisodes: meta.subEpisodes,
    dubEpisodes: meta.dubEpisodes,
    score: meta.score,
    duration: meta.duration,
    alternativeTitles: meta.alternativeTitles,
    studios: meta.studios,
    producers: meta.producers,
    anilistIdFromMeta: meta.anilistIdFromMeta,
    malId: meta.malId,
  };

  detailCache.set(id, { data: anime, fetchedAt: Date.now() });
  return anime;
}

function parseAnimeMeta(html: string): Partial<Animo4Anime> {
  const meta: Partial<Animo4Anime> = {};

  // 1. Title — prefer og:title (format: "Details Of {Title} - ANIMO")
  const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
  if (ogTitleMatch) {
    const t = unescapeHtml(ogTitleMatch[1]);
    meta.title = t.replace(/^Details Of\s+/i, "").replace(/\s*-\s*ANIMO\s*$/i, "").trim();
  }

  // 2. Synopsis — og:description (strip ".... Read More On ANIMO" suffix)
  const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/);
  if (ogDescMatch) {
    meta.synopsis = unescapeHtml(ogDescMatch[1]).replace(/\s*\.{2,}\s*Read More On ANIMO\s*$/i, "").trim();
  }

  // 3. AniList + MAL IDs — meta tags
  const anilistMatch = html.match(/<meta\s+name="anilist-id"\s+content="([^"]+)"/);
  if (anilistMatch) {
    meta.anilistIdFromMeta = parseInt(anilistMatch[1], 10);
  }
  const malMatch = html.match(/<meta\s+name="mal-id"\s+content="([^"]+)"/);
  if (malMatch) {
    meta.malId = parseInt(malMatch[1], 10);
  }

  // 4. Info panel rows — extract (id, label, value) triples from RSC payload
  // Pattern in raw HTML (with JS string escapes):
  //   [\"$\",\"div\",\"{id}\",{\"className\":\"...\",\"children\":
  //     [[\"$\",\"span\",null,{\"className\":\"...\",\"children\":\"{label}\"}],
  //      [\"$\",\"span\",null,{\"className\":\"...\",\"children\":\"{value}\"}]]}]
  const rowRe = /\[\\"\$\\",\\"div\\",\\"([a-z]+)\\",\{[^}]*\\"children\\":\[\[\\"\$\\",\\"span\\",null,\{[^}]*\\"children\\":\\"([^"\\]+)\\"\}\],\[\\"\$\\",\\"span\\",null,\{[^}]*\\"children\\":\\"([^"\\]+)\\"\}\]\]\}\]/g;
  let m: RegExpExecArray | null;
  const rows: Record<string, string> = {};
  while ((m = rowRe.exec(html)) !== null) {
    const [, id, , value] = m;
    if (id && value) rows[id] = unescapeHtml(value);
  }

  if (rows.format) meta.type = rows.format;
  if (rows.status) meta.status = rows.status.charAt(0).toUpperCase() + rows.status.slice(1).toLowerCase();
  if (rows.score) {
    const s = parseFloat(rows.score);
    if (!isNaN(s)) meta.score = s;
  }
  if (rows.premiered) {
    // "Spring 2019"
    const pMatch = rows.premiered.match(/^(\w+)\s+(\d{4})$/);
    if (pMatch) {
      meta.season = pMatch[1];
      meta.year = parseInt(pMatch[2], 10);
    }
  } else if (rows.aired) {
    // "Apr 5, 2019 to Sep 27, 2019"
    const yMatch = rows.aired.match(/\b(20\d{2})\b/);
    if (yMatch) meta.year = parseInt(yMatch[1], 10);
  }
  if (rows.episodes) {
    // "26 eps"
    const eMatch = rows.episodes.match(/(\d+)/);
    if (eMatch) meta.totalEpisodes = parseInt(eMatch[1], 10);
  }
  if (rows.duration) {
    // "23 mins"
    const dMatch = rows.duration.match(/(\d+)/);
    if (dMatch) meta.duration = parseInt(dMatch[1], 10);
  }

  // 5. Alternative titles — collect romaji, english, japanese, synonyms rows
  const altTitles: string[] = [];
  if (rows.romaji) altTitles.push(rows.romaji);
  if (rows.japanese) altTitles.push(rows.japanese);
  if (rows.synonyms) {
    // Synonyms row has comma-separated values
    rows.synonyms.split(",").forEach((s) => {
      const t = s.trim();
      if (t && !altTitles.includes(t)) altTitles.push(t);
    });
  }
  if (altTitles.length) meta.alternativeTitles = altTitles;

  // 6. Studios / producers
  if (rows.studios) meta.studios = rows.studios.split(",").map((s) => s.trim());
  if (rows.producers) meta.producers = rows.producers.split(",").map((s) => s.trim());

  // 7. Genres — these are rendered as a separate section. Look for the genre
  //    list which appears as <a> tags with /az-list/{Letter} or genre chips.
  //    The detail page doesn't expose genres in the info panel — skip for now.

  return meta;
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// ─────────────────────────────────────────────────────────────────────
// Stream resolution
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve stream URLs for one episode.
 *
 * Returns:
 *   - One entry per (type, server-quality) combination
 *   - Each entry is an iframe embed URL (the browser handles the Cloudflare
 *     challenge on the embed page itself)
 *   - Subtitles are extracted from the getSources API (directUrl field —
 *     mt.nekostream.site — which is publicly fetchable)
 */
export async function resolveAnimo4Streams(
  id: number,
  episode: number,
  slug: string,
  types: Array<"sub" | "dub"> = ["sub", "dub"]
): Promise<Animo4StreamResult[]> {
  const results: Animo4StreamResult[] = [];

  // Get detail to know which types are available
  const detail = await fetchAnimo4Detail(id, slug);
  const wantSub = types.includes("sub") && (detail?.subEpisodes ?? 0) > 0;
  const wantDub = types.includes("dub") && (detail?.dubEpisodes ?? 0) > 0;

  const tryTypes: Array<"sub" | "dub"> = [];
  if (wantSub) tryTypes.push("sub");
  if (wantDub) tryTypes.push("dub");
  // Fallback: if neither was explicitly available, try both anyway (some
  // detail pages don't expose counts but streams still exist)
  if (tryTypes.length === 0) tryTypes.push("sub", "dub");

  await Promise.all(tryTypes.map(async (type) => {
    // Hit the getSources API directly to get subtitles + skip times + m3u8 URL
    // Use animoFetch (curl-based) because Node native fetch gets 403 from CF.
    const apiUrl = `${ANIMO4_CDN}/stream/getSources?hd=1&id=${id}&episode=${episode}&type=${type}`;
    let apiData: {
      sources?: Array<{ file: string; type?: string }>;
      tracks?: Array<{ file: string; label?: string; kind?: string; default?: boolean; directUrl?: string }>;
      intro?: { start: number; end: number };
      outro?: { start: number; end: number };
      encrypted?: boolean;
      server?: number;
    } | null = null;

    // First try with native fetch + AJAX header (fast path)
    try {
      const res = await fetch(apiUrl, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.5",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${ANIMO4_CDN}/embed/hd-1/${id}/${episode}/${type}`,
        },
      });
      if (res.ok) {
        const text = await res.text();
        if (text.startsWith("{")) apiData = JSON.parse(text);
      }
    } catch {
      // Fall through to curl
    }

    // Fallback to curl (CF bypass) if native fetch failed
    if (!apiData) {
      try {
        const { execFile } = require("node:child_process");
        const args = [
          "-sL", "--max-time", "15",
          "-A", UA,
          "-H", "Accept: application/json, text/plain, */*",
          "-H", "X-Requested-With: XMLHttpRequest",
          "-e", `${ANIMO4_CDN}/embed/hd-1/${id}/${episode}/${type}`,
          apiUrl,
        ];
        const result = await new Promise<string>((resolve) => {
          execFile("curl", args, { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024, timeout: 20000 }, (err: any, stdout: string) => {
            if (err || !stdout || stdout.includes("Just a moment")) {
              resolve("");
              return;
            }
            resolve(stdout);
          });
        });
        if (result && result.startsWith("{")) {
          try { apiData = JSON.parse(result); } catch { /* not JSON */ }
        }
      } catch { /* curl unavailable */ }
    }

    // Subtitle tracks — prefer directUrl (publicly fetchable on mt.nekostream.site)
    const subtitleTracks: Array<{ url: string; lang: string; label: string }> = [];
    if (apiData?.tracks) {
      for (const t of apiData.tracks) {
        if (t.kind && t.kind !== "captions" && t.kind !== "subtitles") continue;
        const url = t.directUrl || t.file;
        if (!url) continue;
        // Skip the /p/vp proxy paths (Cloudflare-protected) if no directUrl
        if (!t.directUrl && url.startsWith("/p/")) continue;
        subtitleTracks.push({
          url,
          lang: "en",
          label: t.label || "English",
        });
      }
    }

    // Embed URL — the iframe player handles the actual playback
    const embedUrl = `${ANIMO4_CDN}/embed/hd-1/${id}/${episode}/${type}?k=1&autoPlay=1&skipIntro=1&skipOutro=1`;

    // DEEP SCRAPE: extract the direct m3u8 URL from the sources array.
    // The getSources API returns sources[].file as a relative path like
    // "/p/vp?t=...". We resolve it to the full URL and use it directly.
    // The /p/vp endpoint returns a valid m3u8 playlist (multiple qualities).
    let m3u8Url: string | null = null;
    if (apiData?.sources && Array.isArray(apiData.sources) && apiData.sources.length > 0) {
      const first = apiData.sources[0];
      if (first?.file) {
        if (first.file.startsWith("http")) {
          m3u8Url = first.file;
        } else if (first.file.startsWith("/")) {
          m3u8Url = `${ANIMO4_CDN}${first.file}`;
        }
      }
    }

    // Server name — use the server number from the API if present
    const serverName = apiData?.server ? `HD-${apiData.server}` : "HD-1";

    results.push({
      provider: "animo4",
      type,
      quality: "1080p",
      // Prefer direct m3u8 over embed URL (deep scrape — user request)
      streamUrl: m3u8Url || embedUrl,
      isM3U8: !!m3u8Url,  // true if we extracted a direct m3u8
      isMP4: false,
      isEmbed: !m3u8Url,  // embed only when no m3u8 was found
      serverName,
      subtitleTracks,
      intro: apiData?.intro ?? null,
      outro: apiData?.outro ?? null,
    });
  }));

  return results;
}

// ─────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────

export async function searchAnimo4(query: string): Promise<Animo4Anime[]> {
  if (!query.trim()) return [];
  // Use 4animo's /search endpoint (returns matching anime directly).
  // This is more reliable than scanning the /az-list/All catalog page
  // (which Cloudflare rate-limits aggressively).
  try {
    const html = await animoFetch(`${ANIMO4_BASE}/search?keyword=${encodeURIComponent(query)}`);
    if (!html) return [];

    // Find all /{slug}-{id} links that point to anime detail pages.
    // Pattern: href="/{slug}-{id}" — slug is lowercase kebab, id is 1-5 digits
    const re = /href="\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?-(\d{1,6}))"/g;
    const results: Animo4Anime[] = [];
    const seen = new Set<number>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const slug = m[1];
      const id = parseInt(m[2], 10);
      if (!id || seen.has(id)) continue;
      if (slug.startsWith("az-list-") || slug.startsWith("anime-")) continue;
      seen.add(id);
      results.push({
        id,
        slug,
        title: slugToTitle(slug, id),
        poster: `${ANIMO4_IMG}/poster/${id}.jpg`,
        banner: `${ANIMO4_IMG}/banner/${id}.jpg`,
      });
    }
    // If we found slugs, fetch their real titles from the catalog (if loaded)
    // or accept the slug-derived title as a fallback.
    const all = await fetchAnimo4Catalog().catch(() => []);
    if (all.length > 0) {
      for (const r of results) {
        const match = all.find(a => a.id === r.id);
        if (match) r.title = match.title;
      }
    }
    return results.slice(0, 50);
  } catch {
    return [];
  }
}
