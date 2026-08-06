import type { MetadataRoute } from "next";

/**
 * Sitemap for LuffyTV (luffytv.live)
 *
 * Generates 1000+ URLs:
 * - Static pages (browse, trending, schedule, dub, genres, etc.)
 * - 250+ popular anime detail + watch pages from AniList
 * - 50 trending anime pages
 * - 50 top-rated anime pages
 * - Genre × dub language combo pages
 *
 * All AniList API calls have 8s timeout protection.
 * If API fails, hardcoded popular anime IDs still generate entries.
 */

const BASE = "https://luffytv.live";
const ANILIST_API = "https://graphql.anilist.co";
const API_TIMEOUT = 8000;

// ── Create URL-friendly slug from anime title ──
function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "anime";
}

// ── Fetch with timeout ──
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Popular anime IDs (hardcoded fallback — always included even if API dies)
const POPULAR_ANIME_IDS = [
  1, 21, 30, 5114, 16498, 20, 1735, 21459, 40756, 1015, 9253, 13309, 41467,
  21027, 142362, 157971, 160526, 127230, 38000, 153622, 131391, 150723, 157853, 175623, 163394, 176940,
  31964, 20583, 21604, 15494, 30002, 11304, 37510, 1019, 16456, 19815, 21359, 37537, 11597,
  11843, 40356, 101917, 145023, 129658, 104580, 158023, 146954,
  10602, 11061, 11, 9969, 4181, 2167, 26349, 28851, 37999, 125574,
  533, 746, 4450, 2889, 1973, 1066, 20954, 13625,
  16455, 125, 235, 14729, 3450, 15675, 11757, 3190, 14813,
  15365, 10164, 21827, 14725, 12687,
  9494, 28049, 16267, 8496, 20785, 36016, 147558,
  25755, 28223, 23755, 13391, 21939, 14691, 33986, 37520, 1790, 1575,
];

// Expanded genres for more SEO landing pages
const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy",
  "Horror", "Mecha", "Music", "Mystery", "Psychological",
  "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural",
  "Thriller", "Isekai", "Demons", "Martial Arts", "Military",
  "Parody", "Samurai", "School", "Seinen", "Shoujo",
  "Shounen", "Space", "Super Power", "Vampire", "Ecchi",
];

// Dub language pages for SEO
const DUB_LANGUAGES = ["tamil", "hindi", "telugu", "bengali"];

// ── Resolve hardcoded IDs to slugs via AniList ──
async function fetchAnimeSlugs(ids: number[]): Promise<Map<number, string>> {
  const slugMap = new Map<number, string>();
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50));
  }

  await Promise.allSettled(chunks.map(async (chunk) => {
    try {
      const res = await fetchWithTimeout(ANILIST_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query ($ids: [Int], $page: Int) {
            Page(page: $page, perPage: 50) {
              media(id_in: $ids, type: ANIME) { id title { romaji english } }
            }
          }`,
          variables: { ids: chunk, page: 1 },
        }),
      }, API_TIMEOUT);

      if (!res.ok) throw new Error(`AniList ${res.status}`);
      const data = await res.json();
      const media = data?.data?.Page?.media || [];
      for (const m of media) {
        const title = m.title?.english || m.title?.romaji || "";
        const slug = title ? `${toSlug(title)}-${m.id}` : `${m.id}`;
        slugMap.set(m.id, slug);
      }
    } catch {
      for (const id of chunk) slugMap.set(id, `${id}`);
    }
  }));

  for (const id of ids) {
    if (!slugMap.has(id)) slugMap.set(id, `${id}`);
  }
  return slugMap;
}

// ── Fetch anime sorted by a given criteria across multiple pages ──
async function fetchAnimeBySort(sort: string, totalPages: number = 3): Promise<Array<{ slug: string; id: number }>> {
  const results: Array<{ slug: string; id: number }> = [];
  const seenIds = new Set<number>();

  const pagePromises = Array.from({ length: totalPages }, (_, i) => i + 1).map(async (page) => {
    try {
      const res = await fetchWithTimeout(ANILIST_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query ($page: Int, $perPage: Int, $sort: [MediaSort]) {
            Page(page: $page, perPage: $perPage) {
              media(sort: $sort, type: ANIME, isAdult: false) { id title { romaji english } }
            }
          }`,
          variables: { page, perPage: 50, sort: [sort] },
        }),
      }, API_TIMEOUT);

      if (!res.ok) return;
      const data = await res.json();
      const media = data?.data?.Page?.media || [];
      for (const m of media) {
        if (seenIds.has(m.id)) continue;
        seenIds.add(m.id);
        const title = m.title?.english || m.title?.romaji || "";
        const slug = title ? `${toSlug(title)}-${m.id}` : `${m.id}`;
        results.push({ slug, id: m.id });
      }
    } catch {
      // skip failed page
    }
  });

  await Promise.allSettled(pagePromises);
  return results;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // ── Fetch all anime data in parallel ──
  const [slugMap, popularAnime, trendingAnime, topRatedAnime] = await Promise.all([
    fetchAnimeSlugs(POPULAR_ANIME_IDS),
    fetchAnimeBySort("POPULARITY_DESC", 5),  // 5 pages × 50 = up to 250 popular
    fetchAnimeBySort("TRENDING_DESC", 2),     // 2 pages × 50 = up to 100 trending
    fetchAnimeBySort("SCORE_DESC", 2),         // 2 pages × 50 = up to 100 top-rated
  ]);

  const entries: MetadataRoute.Sitemap = [
    // ═══ MAIN PAGES ═══
    { url: BASE, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/browse`, lastModified: now, changeFrequency: "daily", priority: 0.95 },
    { url: `${BASE}/schedule`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/genres`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE}/trending`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/top-rated`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE}/discover`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/search`, lastModified: now, changeFrequency: "daily", priority: 0.7 },

    // ═══ DUB / SUB PAGES ═══
    { url: `${BASE}/dub`, lastModified: now, changeFrequency: "daily", priority: 0.95 },
    { url: `${BASE}/sub`, lastModified: now, changeFrequency: "daily", priority: 0.9 },

    ...DUB_LANGUAGES.map(lang => ({
      url: `${BASE}/dub/${lang}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.92,
    })),

    // ═══ SUB language pages ═══
    { url: `${BASE}/sub/english`, lastModified: now, changeFrequency: "daily", priority: 0.88 },
    { url: `${BASE}/sub/japanese`, lastModified: now, changeFrequency: "daily", priority: 0.85 },

    // ═══ GENRE PAGES ═══
    ...GENRES.map(genre => ({
      url: `${BASE}/genre/${genre.toLowerCase().replace(/ /g, "-")}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.82,
    })),

    // ═══ GENRE × DUB COMBO PAGES (huge SEO surface) ═══
    ...GENRES.flatMap(genre =>
      DUB_LANGUAGES.map(lang => ({
        url: `${BASE}/genre/${genre.toLowerCase().replace(/ /g, "-")}/dub/${lang}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.75,
      }))
    ),

    // ═══ CONTENT SECTIONS ═══
    { url: `${BASE}/manga`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${BASE}/novel`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE}/music`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE}/torrent`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },

    // ═══ USER FEATURES ═══
    { url: `${BASE}/watchlist`, lastModified: now, changeFrequency: "always", priority: 0.6 },
    { url: `${BASE}/bookmarks`, lastModified: now, changeFrequency: "always", priority: 0.6 },
    { url: `${BASE}/history`, lastModified: now, changeFrequency: "always", priority: 0.5 },
    { url: `${BASE}/updates`, lastModified: now, changeFrequency: "daily", priority: 0.7 },

    // ═══ UTILITY / INFO PAGES ═══
    { url: `${BASE}/guide`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE}/donate`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },

    // ═══ YEAR PAGES (for "anime 2024" type searches) ═══
    ...Array.from({ length: 10 }, (_, i) => 2026 - i).map(year => ({
      url: `${BASE}/year/${year}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),

    // ═══ STUDIO / PRODUCER PAGES ═══
    { url: `${BASE}/studios`, lastModified: now, changeFrequency: "weekly", priority: 0.65 },

    // ═══ SEASONAL PAGES ═══
    ...["winter", "spring", "summer", "fall"].map(season => ({
      url: `${BASE}/season/${season}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.78,
    })),
  ];

  // ═══ HARDCODED POPULAR ANIME (always included, even if API fails) ═══
  const seenIds = new Set<number>();
  for (const id of POPULAR_ANIME_IDS) {
    seenIds.add(id);
    const slug = slugMap.get(id) || `${id}`;
    entries.push({
      url: `${BASE}/anime/${slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    });
    entries.push({
      url: `${BASE}/watch/${slug}/1`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  // ═══ DYNAMIC POPULAR ANIME (from AniList - up to 250) ═══
  for (const { slug, id } of popularAnime) {
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    entries.push({ url: `${BASE}/anime/${slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.78 });
    entries.push({ url: `${BASE}/watch/${slug}/1`, lastModified: now, changeFrequency: "weekly", priority: 0.68 });
  }

  // ═══ TRENDING ANIME ═══
  for (const { slug, id } of trendingAnime) {
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    entries.push({ url: `${BASE}/anime/${slug}`, lastModified: now, changeFrequency: "daily", priority: 0.75 });
  }

  // ═══ TOP-RATED ANIME ═══
  for (const { slug, id } of topRatedAnime) {
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    entries.push({ url: `${BASE}/anime/${slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.76 });
  }

  return entries;
}

// ── Force sitemap to revalidate every 1 hour ──
// Without this, Next.js caches the sitemap indefinitely and Google
// keeps seeing the old 24-page version even after code updates.
export const revalidate = 3600; // 1 hour — Google re-reads fresh data
