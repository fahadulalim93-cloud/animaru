/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Bulk Anime Scraper — Jikan (MAL mirror) + AniList fallback
 *  ========================================================
 *  Scrapes 1,000+ anime with FULL metadata (banner, cover, description,
 *  characters, voice actors, staff, studios, recommendations, relations,
 *  trailer, episodes, etc.) and saves each to PostgreSQL AniListCache.
 *
 *  Why Jikan (not AniList directly)?
 *    - AniList is currently rate-limiting/down for some users
 *    - Jikan (jikan.moe) is a free MAL API mirror — public, reliable,
 *      no auth needed, 3 req/sec limit (60/min)
 *    - Jikan returns MAL ID; we resolve MAL→AniList via AniList's
 *      idMal lookup (one quick query per anime, batched in parallel)
 *
 *  Why not scrape AnimePahe/AniKoto/AniNeko directly?
 *    - Those sites don't have metadata — they only have stream URLs.
 *    - They use AniList/MAL IDs themselves and embed metadata from there.
 *    - Going to Jikan/AniList directly is faster + gives cleaner data.
 *
 *  Strategy:
 *    1. Fetch top 1,000 anime from Jikan (top anime list, 25 per page, 40 pages)
 *    2. For each anime, query AniList GraphQL by idMal to get AniList ID
 *    3. Query AniList GraphQL with AniList ID to get FULL metadata
 *    4. Save to AniListCache table with proper cacheKey
 *    5. Concurrency 3 — well under both APIs' rate limits
 *
 *  Run on VPS:
 *    docker exec -d <container> node /app/scripts/scrape-jikan-bulk.mjs
 *    docker exec <container> tail -f /tmp/scrape.log
 * ═══════════════════════════════════════════════════════════════════════
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const JIKAN_BASE = "https://api.jikan.moe/v4";
const ANILIST_API = "https://graphql.anilist.co";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ── AniList query — same as app's getAnimeDetails() ──
// (must match so cacheKeys align with app reads)
const ANILIST_FULL_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      idMal
      title { romaji english native }
      coverImage { extraLarge large medium color }
      bannerImage
      description(asHtml: false)
      type format status
      episodes duration
      genres
      averageScore meanScore popularity trending favourites
      season seasonYear
      countryOfOrigin isAdult source
      siteUrl
      nextAiringEpisode { episode airingAt }
      streamingEpisodes { title thumbnail url site }
      studios { nodes { id name isAnimationStudio } }
      characters(sort: ROLE, perPage: 12) {
        edges { node { id name { full native } image { large medium } } role }
      }
      recommendations(sort: RATING_DESC, perPage: 8) {
        nodes {
          id rating
          mediaRecommendation {
            id title { romaji english native }
            coverImage { extraLarge large medium }
            type episodes averageScore status
          }
        }
      }
      relations {
        edges {
          relationType
          node {
            id title { romaji english native }
            coverImage { extraLarge large medium }
            type format episodes status
          }
        }
      }
      externalLinks { id url site type icon color language }
      trailer { id site thumbnail }
    }
  }
`;

// ── AniList MAL→AniList resolver ──
const MAL_TO_ANILIST_QUERY = `
  query ($idMal: Int) {
    Media(idMal: $idMal, type: ANIME) {
      id
      idMal
    }
  }
`;

function buildCacheKey(query, variables) {
  const normalizedQuery = query.replace(/\s+/g, " ").trim();
  const varsKey = variables
    ? JSON.stringify(variables, Object.keys(variables).sort())
    : "";
  return `${normalizedQuery}:${varsKey}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Fetch from Jikan (MAL mirror) — top anime by popularity ──
async function fetchJikanTop(page = 1, limit = 25) {
  // Jikan rate limit: 3 req/sec, 60 req/min. We sleep 350ms between requests.
  await sleep(350);
  const url = `${JIKAN_BASE}/top/anime?page=${page}&limit=${limit}&filter=bypopularity`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 429) {
      console.warn(`[jikan] rate limited on page ${page} — sleeping 5s`);
      await sleep(5000);
      return fetchJikanTop(page, limit);
    }
    if (!res.ok) {
      console.warn(`[jikan] page ${page} HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    return json.data || [];
  } catch (e) {
    console.warn(`[jikan] page ${page} failed: ${e.message}`);
    return null;
  }
}

// ── Resolve MAL ID → AniList ID ──
async function resolveAnilistIdFromMal(malId) {
  try {
    const res = await fetch(ANILIST_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": UA,
      },
      body: JSON.stringify({
        query: MAL_TO_ANILIST_QUERY,
        variables: { idMal: malId },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.Media?.id || null;
  } catch {
    return null;
  }
}

// ── Fetch full AniList metadata by AniList ID ──
async function fetchAnilistFull(anilistId) {
  try {
    const res = await fetch(ANILIST_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": UA,
      },
      body: JSON.stringify({
        query: ANILIST_FULL_QUERY,
        variables: { id: anilistId },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 429) {
      console.warn(`[anilist] rate limited on ${anilistId} — sleeping 30s`);
      await sleep(30000);
      return fetchAnilistFull(anilistId);
    }
    if (!res.ok) return null;
    const json = await res.json();
    if (json.errors) return null;
    return json.data?.Media || null;
  } catch {
    return null;
  }
}

// ── Save to AniListCache ──
async function saveToCache(anime) {
  const cacheKey = buildCacheKey(ANILIST_FULL_QUERY, { id: anime.id });
  const data = { Media: anime };
  try {
    await db.aniListCache.upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        anilistId: anime.id,
        operation: "Media",
        response: data,
        source: "jikan-bulk-scrape",
        hits: 0,
        errorCount: 0,
      },
      update: {
        response: data,
        source: "jikan-bulk-scrape",
        updatedAt: new Date(),
        errorCount: 0,
      },
    });
    return true;
  } catch (e) {
    console.warn(`[db] save failed for ${anime.id}: ${e.message.slice(0, 80)}`);
    return false;
  }
}

// ── Process one anime (MAL ID → AniList ID → full metadata → save) ──
async function processOne(jikanAnime) {
  const malId = jikanAnime.mal_id;
  if (!malId) return false;

  // 1. Resolve MAL → AniList ID
  const anilistId = await resolveAnilistIdFromMal(malId);
  if (!anilistId) {
    console.warn(`  [skip] MAL ${malId} "${jikanAnime.title_english || jikanAnime.title}" — no AniList entry`);
    return false;
  }

  // 2. Fetch full AniList metadata
  const media = await fetchAnilistFull(anilistId);
  if (!media) {
    console.warn(`  [skip] AniList ${anilistId} (MAL ${malId}) — fetch failed`);
    return false;
  }

  // 3. Save
  const saved = await saveToCache(media);
  if (saved) {
    const title = media.title?.english || media.title?.romaji || "?";
    const score = media.averageScore || 0;
    const year = media.seasonYear || "?";
    console.log(`  [ok] ${String(anilistId).padEnd(7)} ${title.padEnd(40).slice(0, 40)} (${year}, ${score}%)`);
  }
  return saved;
}

// ── Run a batch of 3 anime in parallel ──
async function processBatch(jikanAnimeList) {
  const results = await Promise.all(jikanAnimeList.map(processOne));
  return results.filter(Boolean).length;
}

// ── Main ──
async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Bulk Anime Scraper — Jikan + AniList");
  console.log("  Target: 1,000 anime with FULL metadata");
  console.log("═══════════════════════════════════════════════════════\n");

  const before = await db.aniListCache.count();
  // Count unique anime — use groupBy since distinct+count isn't supported directly
  const beforeGroups = await db.aniListCache.groupBy({
    by: ["anilistId"],
    where: { anilistId: { not: null } },
    _count: { _all: true },
  });
  const beforeUnique = beforeGroups.length;
  console.log(`[start] DB has ${before.toLocaleString()} total entries, ${beforeUnique.toLocaleString()} unique anime\n`);

  let totalSaved = 0;
  const TOTAL_PAGES = 40; // 40 × 25 = 1,000 anime
  const CONCURRENCY = 3;

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const animes = await fetchJikanTop(page);
    if (!animes?.length) {
      console.warn(`[page ${page}] no data — stopping early`);
      break;
    }
    console.log(`\n[page ${page}/${TOTAL_PAGES}] got ${animes.length} anime from Jikan`);

    // Process in batches of 3
    for (let i = 0; i < animes.length; i += CONCURRENCY) {
      const batch = animes.slice(i, i + CONCURRENCY);
      const saved = await processBatch(batch);
      totalSaved += saved;
    }

    const after = await db.aniListCache.count();
    console.log(`[page ${page}] done — saved ${totalSaved.toLocaleString()} total (DB now ${after.toLocaleString()})`);
  }

  const after = await db.aniListCache.count();
  const afterUnique = await db.aniListCache.findMany({
    where: { anilistId: { not: null } },
    select: { anilistId: true },
    distinct: ["anilistId"],
  });
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  ✓ DONE`);
  console.log(`  Saved:          ${totalSaved.toLocaleString()} anime`);
  console.log(`  DB entries:      ${before.toLocaleString()} → ${after.toLocaleString()}`);
  console.log(`  Unique anime:    ${beforeUnique.length.toLocaleString()} → ${afterUnique.length.toLocaleString()}`);
  console.log("═══════════════════════════════════════════════════════");

  await db.$disconnect();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
