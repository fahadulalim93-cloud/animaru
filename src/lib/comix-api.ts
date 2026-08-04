// ============================================================
// Comix.to scraper — English manga provider
// ---------------------------------------------------------------------
// Comix.to is a SvelteKit app with Cloudflare protection.
// The title detail page has #initial-data JSON with manga metadata
// (title, genres, tags, synopsis, poster, author, status, type, year).
// Chapter list and chapter images are loaded via CF-protected API
// (/api/v1/manga/{hid}/chapters) which requires a CF challenge token.
//
// Strategy:
// - Search: scrape comix.to/browse HTML for manga list
// - Detail: fetch title page HTML, extract #initial-data JSON
// - Chapters: derive from detail's firstChapterUrl/latestChapterUrl
//   (the chapter list API is CF-protected, so we construct chapter
//    URLs from the URL pattern: /title/{hid}-{slug}/{chapterId}-chapter-{num})
// - Pages: fetch chapter reading page HTML, extract image URLs from
//   static.comix.to CDN (images are publicly accessible, no CF block)
// ============================================================

import type { AtsuMangaEntry, AtsuMangaDetail, AtsuMangaChapter, AtsuChapterPage } from "./manga-api";

const COMIX_BASE = "https://comix.to";

const COMIX_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

/** Fetch raw HTML from comix.to page (via comix-proxy route for CF bypass) */
async function fetchComixRawHtml(path: string): Promise<string> {
  const fullUrl = `${COMIX_BASE}${path}`;

  // Step 1: Try direct fetch
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(fullUrl, {
      headers: COMIX_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (res.ok) {
      return await res.text();
    }
  } catch { /* fall through */ }

  // Step 2: Try via comix-proxy route (uses z-ai page_reader)
  try {
    const origin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const proxyRes = await fetch(
      `${origin}/api/manga/comix-proxy?url=${encodeURIComponent(fullUrl)}`,
      { signal: AbortSignal.timeout(20000) }
    );
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.html) return data.html;
    }
  } catch { /* fall through */ }

  return "";
}

/** Fetch a comix.to page and extract #initial-data JSON.
 * Comix.to is Cloudflare-protected — uses the z-ai-web-dev-sdk page_reader
 * function which can bypass CF challenges.
 *
 * Since we can't call the SDK directly from a server-side route, we use
 * a two-step approach:
 * 1. Try a direct fetch with full browser headers first
 * 2. If that fails (403), fall back to fetching via our own API route
 *    that uses the z-ai page_reader function
 */
async function fetchComixPage(path: string): Promise<any | null> {
  const fullUrl = `${COMIX_BASE}${path}`;

  // Step 1: Try direct fetch with full browser headers
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(fullUrl, {
      headers: COMIX_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/<script type="application\/json" id="initial-data">(.*?)<\/script>/s);
      if (match) {
        return JSON.parse(match[1]);
      }
    }
  } catch {
    // Fall through to step 2
  }

  // Step 2: Try via our /api/manga/comix-proxy route (uses z-ai page_reader)
  try {
    // In server-side fetch, we need an absolute URL.
    // On Vercel: use the VERCEL_URL env var
    // In dev: use localhost:3000 (default Next.js port)
    const origin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const proxyRes = await fetch(
      `${origin}/api/manga/comix-proxy?url=${encodeURIComponent(fullUrl)}`,
      { signal: AbortSignal.timeout(20000) }
    );
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.html) {
        const match = data.html.match(/<script type="application\/json" id="initial-data">(.*?)<\/script>/s);
        if (match) {
          return JSON.parse(match[1]);
        }
      }
    }
  } catch {
    // Fall through
  }

  return null;
}

/** Fetch comix.to browse page and extract manga list from HTML */
export async function searchComix(query: string): Promise<AtsuMangaEntry[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${COMIX_BASE}/browse?q=${encodeURIComponent(query)}&page=1`, {
      headers: COMIX_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    let html: string;
    if (!res.ok) {
      // Direct fetch failed (likely CF block) — fall back to z-ai page_reader proxy
      const proxyBase = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const proxyRes = await fetch(
        `${proxyBase}/api/manga/comix-proxy?url=${encodeURIComponent(`${COMIX_BASE}/browse?q=${encodeURIComponent(query)}&page=1`)}`,
        { signal: AbortSignal.timeout(15000) },
      );
      if (!proxyRes.ok) return [];
      html = await proxyRes.text();
    } else {
      html = await res.text();
    }

    // Extract initial-data JSON
    const match = html.match(/<script type="application\/json" id="initial-data">(.*?)<\/script>/s);
    if (!match) return [];
    const data = JSON.parse(match[1]);

    // Find manga list in queries
    const results: AtsuMangaEntry[] = [];
    for (const [key, val] of Object.entries(data.queries || {})) {
      if (key.includes("search") || key.includes("list") || key.includes("browse")) {
        const items = (val as any)?.items || (val as any)?.data || [];
        if (Array.isArray(items)) {
          for (const item of items) {
            if (item.hid) {
              results.push({
                id: `cx:${item.hid}`,
                title: item.title || "",
                englishTitle: item.altTitles?.[0],
                poster: item.poster?.large || item.poster?.medium || "",
                cover: item.poster?.large || item.poster?.medium || "",
                type: item.type || "manga",
                status: item.status,
                year: item.year,
                rating: item.ratedAvg || item.score,
                source: "comix",
                slug: item.hid,
              });
            }
          }
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** Get manga detail from comix.to title page */
export async function getComixDetail(hid: string): Promise<AtsuMangaDetail | null> {
  try {
    // First, fetch the title page to get the slug + metadata
    // We need the slug for the URL — try fetching /title/{hid}
    const data = await fetchComixPage(`/title/${hid}`);

    // If that didn't work, try searching for the HID
    if (!data) {
      // Try browse search to find the slug
      const searchResults = await searchComix(hid);
      if (searchResults.length > 0) {
        return getComixDetailFromEntry(searchResults[0], hid);
      }
      return null;
    }

    // Find the manga detail query
    let detail: any = null;
    for (const [key, val] of Object.entries(data.queries || {})) {
      if (key.includes("detail") && val && typeof val === "object") {
        detail = val;
        break;
      }
    }

    if (!detail) return null;

    // Extract scan groups from the initial-data
    let groups: { id: number; name: string }[] = [];
    for (const [key, val] of Object.entries(data.queries || {})) {
      if (key.includes("groups") && Array.isArray(val)) {
        groups = val.map((g: any) => ({ id: g.id, name: g.name }));
        break;
      }
    }

    // Extract ALL chapter links from the HTML
    // The title page HTML contains chapter links with the pattern:
    // /title/{hid}-{slug}/{chapterDbId}-chapter-{num}
    // We need to fetch the raw HTML to extract these links
    const rawHtml = await fetchComixRawHtml(`/title/${hid}`);
    const chapterLinkPattern = /\/title\/[a-z0-9]+-[^"'\s]+\/(\d+)-chapter-(\d+(?:\.\d+)?)/g;
    const chapterLinks: { dbId: string; number: number }[] = [];
    let linkMatch;
    while ((linkMatch = chapterLinkPattern.exec(rawHtml)) !== null) {
      chapterLinks.push({
        dbId: linkMatch[1],
        number: parseFloat(linkMatch[2]),
      });
    }

    // Dedupe by number (keep first dbId per number)
    const seenNumbers = new Set<number>();
    const chapters: AtsuMangaChapter[] = [];
    for (const link of chapterLinks) {
      if (!seenNumbers.has(link.number)) {
        seenNumbers.add(link.number);
        // If there are multiple scan groups, create one chapter entry per group
        if (groups.length > 1) {
          for (const group of groups) {
            chapters.push({
              id: `cx_${link.dbId}_${group.id}`,  // Unique per chapter+group
              title: `Chapter ${link.number}`,
              number: link.number,
              lang: "en",  // Comix.to is English-only
              pages: 0,
              pageCount: 0,
              scanGroup: group.name,
            });
          }
        } else {
          chapters.push({
            id: `cx_${link.dbId}`,  // Use the real chapter DB ID
            title: `Chapter ${link.number}`,
            number: link.number,
            lang: "en",
            pages: 0,
            pageCount: 0,
            scanGroup: groups[0]?.name,
          });
        }
      }
    }

    // If no chapter links found, fall back to generating from first/latest
    if (chapters.length === 0) {
      const firstChapterUrl = detail.firstChapterUrl || "";
      const latestChapterNum = detail.latestChapter || 0;
      if (firstChapterUrl && latestChapterNum > 0) {
        const firstMatch = firstChapterUrl.match(/\/(\d+)-chapter-(\d+(?:\.\d+)?)$/);
        if (firstMatch) {
          const firstDbId = firstMatch[1];
          const firstNum = parseFloat(firstMatch[2]);
          for (let num = firstNum; num <= latestChapterNum; num++) {
            chapters.push({
              id: `cx_${hid}_${num}`,
              title: `Chapter ${num}`,
              number: num,
              lang: "en",
              pages: 0,
              pageCount: 0,
            });
          }
        }
      }
    }

    return {
      id: `cx:${hid}`,
      title: detail.title || "",
      englishTitle: detail.altTitles?.[0],
      altTitles: detail.altTitles || [],
      poster: detail.poster?.large || detail.poster?.medium || "",
      banner: detail.poster?.large || "",
      cover: detail.poster?.large || "",
      description: detail.synopsis || "",
      type: detail.type || "manga",
      status: detail.status,
      year: detail.year,
      authors: detail.authors?.map((a: any) => a.title) || "Unknown",
      artists: detail.artists?.map((a: any) => a.title) || [],
      genres: detail.genres?.map((g: any) => g.title) || [],
      tags: detail.tags?.map((t: any) => t.title) || [],
      isAdult: detail.contentRating === "adult",
      anilistId: detail.links?.al ? parseInt(detail.links.al.match(/\d+/)?.[0] || "0") : undefined,
      chapters,
      totalChapters: chapters.length,
      source: "comix",
      slug: hid,
    };
  } catch {
    return null;
  }
}

/** Build a detail from a search entry (when title page fetch fails) */
function getComixDetailFromEntry(entry: AtsuMangaEntry, hid: string): AtsuMangaDetail {
  return {
    id: `cx:${hid}`,
    title: entry.title,
    englishTitle: entry.englishTitle,
    poster: entry.poster || "",
    banner: entry.poster || "",
    cover: entry.cover || "",
    description: "",
    type: entry.type || "manga",
    status: entry.status,
    year: entry.year,
    authors: "Unknown",
    artists: [],
    genres: [],
    tags: [],
    chapters: [],
    totalChapters: 0,
    source: "comix",
    slug: hid,
  };
}

/**
 * Get chapter pages from comix.to.
 * Fetches the chapter reading page HTML and extracts image URLs from
 * static.comix.to CDN.
 *
 * The chapterId is the chapter NUMBER (e.g., "1", "2.5").
 * We construct the URL as: /title/{hid}-{slug}/{chapterId}-chapter-{num}
 * But we don't have the slug — so we try fetching /title/{hid} first
 * to get the slug, then construct the chapter URL.
 *
 * Alternative: try /read/{hid}/{chapterId} (simpler URL pattern).
 */
export async function getComixChapterPages(hid: string, chapterNumber: string): Promise<AtsuChapterPage[]> {
  try {
    // Try fetching the title page to get the slug
    const data = await fetchComixPage(`/title/${hid}`);
    if (!data) return [];

    // Find detail to get the URL (contains slug)
    let detail: any = null;
    for (const [key, val] of Object.entries(data.queries || {})) {
      if (key.includes("detail") && val && typeof val === "object") {
        detail = val;
        break;
      }
    }

    if (!detail) return [];

    // Construct chapter URL
    // URL format: /title/{hid}-{slug}/{chapterDbId}-chapter-{num}
    // We don't have the chapterDbId, so try the browse approach:
    // fetch the title page and look for chapter links in the HTML

    // Actually, let's try fetching the chapter page directly
    // The reading page URL is: /title/{hid}-{slug}/{chapterDbId}-chapter-{num}
    // Since we don't have chapterDbId, we'll try a different approach:
    // fetch the title page HTML and extract chapter links

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${COMIX_BASE}/title/${hid}`, {
      headers: COMIX_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];

    const html = await res.text();

    // Find chapter links that match the chapter number
    // Pattern: /title/{hid}-.../{chapterDbId}-chapter-{num}
    const chapterRegex = new RegExp(
      `/title/${hid}[^"']*?/(\\d+)-chapter-${chapterNumber.replace(/\./g, "\\.")}(?=["'\s])`,
      "i"
    );
    const chapterMatch = html.match(chapterRegex);
    if (!chapterMatch) return [];

    const chapterUrl = chapterMatch[0];

    // Fetch the chapter reading page
    const chapterData = await fetchComixPage(chapterUrl);
    if (!chapterData) return [];

    // The reading page HTML should have image URLs
    // Re-fetch the raw HTML to extract image URLs
    const chapterController = new AbortController();
    const chapterTimeout = setTimeout(() => chapterController.abort(), 15000);
    const chapterRes = await fetch(`${COMIX_BASE}${chapterUrl}`, {
      headers: COMIX_HEADERS,
      signal: chapterController.signal,
    });
    clearTimeout(chapterTimeout);
    if (!chapterRes.ok) return [];

    const chapterHtml = await chapterRes.text();

    // Extract image URLs from static.comix.to CDN
    // These are in the initial-data JSON or in the rendered HTML
    const imgRegex = /https:\/\/static\.comix\.to\/[^"\s<>]+\.(?:jpg|png|webp)/g;
    const imgMatches = chapterHtml.match(imgRegex) || [];

    // Filter out poster images (usually have @280 in the URL)
    const pageImages = imgMatches.filter(url => !url.includes("@280") && !url.includes("@180"));

    // Dedupe
    const seen = new Set<string>();
    const pages: AtsuChapterPage[] = [];
    for (const url of pageImages) {
      if (!seen.has(url)) {
        seen.add(url);
        pages.push({
          index: pages.length,
          url,
        });
      }
    }

    return pages;
  } catch {
    return [];
  }
}

// ============================================================
// Additional comix.to browse/home endpoints
// ============================================================

interface ComixBrowseItem {
  hid: string;
  title: string;
  altTitles?: string[];
  poster?: { large?: string; medium?: string };
  type?: string;
  status?: number;
  year?: number;
  ratedAvg?: number;
  score?: number;
  follows?: number;
  contentRating?: string;
}

/** Fetch browse page from comix.to and extract manga list from initial-data */
async function fetchComixBrowse(
  sort: string = "views_7d",
  page: number = 1,
  extraParams: Record<string, string> = {}
): Promise<AtsuMangaEntry[]> {
  try {
    const params = new URLSearchParams({ sort, page: String(page), ...extraParams });
    const html = await fetchComixRawHtml(`/browse?${params}`);
    if (!html) return [];

    const match = html.match(/<script type="application\/json" id="initial-data">(.*?)<\/script>/s);
    if (!match) return [];
    const data = JSON.parse(match[1]);

    const results: AtsuMangaEntry[] = [];
    for (const [key, val] of Object.entries(data.queries || {})) {
      if (key.includes("list") || key.includes("browse") || key.includes("search")) {
        const items = (val as any)?.items || (val as any)?.data || [];
        if (Array.isArray(items)) {
          for (const item of items as ComixBrowseItem[]) {
            if (item.hid) {
              results.push({
                id: `cx:${item.hid}`,
                title: item.title || "",
                englishTitle: item.altTitles?.[0],
                poster: item.poster?.large || item.poster?.medium || "",
                cover: item.poster?.large || item.poster?.medium || "",
                type: item.type || "manga",
                status: item.status,
                year: item.year,
                rating: item.ratedAvg || item.score,
                source: "comix",
                slug: item.hid,
              });
            }
          }
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** Get trending/popular manga from comix.to */
export async function getComixTrending(
  sort: "views_7d" | "views_30d" | "views_90d" | "views_total" | "follows_total" | "score" = "views_7d",
  page: number = 1
): Promise<AtsuMangaEntry[]> {
  return fetchComixBrowse(sort, page);
}

/** Get most followed manga from comix.to */
export async function getComixMostFollowed(page: number = 1): Promise<AtsuMangaEntry[]> {
  return fetchComixBrowse("follows_total", page);
}

/** Get top rated manga from comix.to */
export async function getComixTopRated(page: number = 1): Promise<AtsuMangaEntry[]> {
  return fetchComixBrowse("score", page);
}

/** Get filter options from comix.to browse page */
export async function getComixFilterOptions(): Promise<{
  genres: string[];
  types: string[];
  demographics: string[];
  statuses: string[];
  sorts: string[];
  formats: string[];
  years: number[];
} | null> {
  try {
    const html = await fetchComixRawHtml("/browse");
    if (!html) return null;

    const match = html.match(/<script type="application\/json" id="initial-data">(.*?)<\/script>/s);
    if (!match) return null;
    const data = JSON.parse(match[1]);

    // Extract filter options from the initial-data
    const filters = data?.filters || data?.filterOptions || null;
    if (filters) {
      return {
        genres: filters.genres || [],
        types: filters.types || [],
        demographics: filters.demographics || [],
        statuses: filters.statuses || [],
        sorts: filters.sorts || ["views_7d", "views_30d", "views_90d", "views_total", "follows_total", "score"],
        formats: filters.formats || [],
        years: filters.years || [],
      };
    }

    // Fallback: return default sort options at minimum
    return {
      genres: [],
      types: [],
      demographics: [],
      statuses: [],
      sorts: ["views_7d", "views_30d", "views_90d", "views_total", "follows_total", "score"],
      formats: [],
      years: [],
    };
  } catch {
    return null;
  }
}

/** Get home page sections from comix.to — combines trending, top-rated, most-followed, latest */
export async function getComixHomeSections(): Promise<{
  latestUpdates: AtsuMangaEntry[];
  trending: AtsuMangaEntry[];
  topRated: AtsuMangaEntry[];
  mostFollowed: AtsuMangaEntry[];
  recentlyAdded: AtsuMangaEntry[];
  genres: string[];
  types: string[];
  filters: any;
}> {
  try {
    const [trending, topRated, mostFollowed, latestUpdates, recentlyAdded] = await Promise.all([
      getComixTrending("views_7d", 1),
      getComixTopRated(1),
      getComixMostFollowed(1),
      fetchComixBrowse("latest", 1),
      fetchComixBrowse("views_total", 1),
    ]);

    const filterOptions = await getComixFilterOptions();

    return {
      latestUpdates,
      trending,
      topRated,
      mostFollowed,
      recentlyAdded,
      genres: filterOptions?.genres || [],
      types: filterOptions?.types || [],
      filters: filterOptions,
    };
  } catch {
    return {
      latestUpdates: [],
      trending: [],
      topRated: [],
      mostFollowed: [],
      recentlyAdded: [],
      genres: [],
      types: [],
      filters: null,
    };
  }
}
