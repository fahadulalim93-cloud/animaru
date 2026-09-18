/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AniList Database Seeder
 *  =======================
 *  Fetches ALL ~22,000 anime from AniList GraphQL API and saves each to
 *  the PostgreSQL AniListCache table with FULL detail-page metadata:
 *    - title (english/romaji/native), coverImage, bannerImage
 *    - description, episodes, duration, genres, scores
 *    - season, seasonYear, format, status
 *    - characters + voice actors (12 each)
 *    - staff (12)
 *    - studios (animation + license)
 *    - recommendations (8)
 *    - relations (all)
 *    - trailer, externalLinks, nextAiringEpisode, streamingEpisodes
 *
 *  Strategy:
 *    1. AniList's Page query returns 50 anime per request with ALL fields
 *    2. 22,000 / 50 = 440 page requests
 *    3. Run 3 concurrent page fetches (well under AniList's 90 req/min limit)
 *    4. For each anime in each page, save to AniListCache using the SAME
 *       cacheKey format that anilist-cache.ts uses (so app reads hit the DB)
 *    5. Estimated time: ~5-8 minutes
 *
 *  Run inside the luffytv container:
 *    docker exec -it <container> node /app/scripts/seed-anilist-db.mjs
 *
 *  Or in background:
 *    docker exec -d <container> node /app/scripts/seed-anilist-db.mjs > /tmp/seed.log 2>&1
 * ═══════════════════════════════════════════════════════════════════════
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const ANILIST_API = "https://graphql.anilist.co";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ── The EXACT query the app uses for getAnimeDetails() ──
// (must match src/lib/anilist-api.ts verbatim so cacheKeys align)
const MEDIA_QUERY = `
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

// ── Page query — fetches 50 anime at once with ALL detail fields ──
const PAGE_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage perPage }
      media(type: ANIME, sort: POPULARITY_DESC) {
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
  }
`;

// ── Cache key builder — must match src/lib/anilist-cache.ts ──
function buildCacheKey(query, variables) {
  const normalizedQuery = query.replace(/\s+/g, " ").trim();
  const varsKey = variables
    ? JSON.stringify(variables, Object.keys(variables).sort())
    : "";
  return `${normalizedQuery}:${varsKey}`;
}

// ── Fetch one page from AniList ──
async function fetchPage(pageNum, perPage = 50) {
  const body = JSON.stringify({ query: PAGE_QUERY, variables: { page: pageNum, perPage } });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(ANILIST_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": UA,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.status === 429) {
      console.warn(`[page ${pageNum}] Rate limited — sleeping 60s`);
      await sleep(60000);
      return fetchPage(pageNum, perPage);
    }
    if (!res.ok) {
      console.warn(`[page ${pageNum}] HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    if (json.errors) {
      console.warn(`[page ${pageNum}] GraphQL error: ${json.errors[0]?.message}`);
      return null;
    }
    return json.data?.Page || null;
  } catch (e) {
    clearTimeout(timeout);
    console.warn(`[page ${pageNum}] fetch failed: ${e.message}`);
    return null;
  }
}

// ── Save one anime to AniListCache ──
async function saveAnimeToCache(anime) {
  const cacheKey = buildCacheKey(MEDIA_QUERY, { id: anime.id });
  const data = { Media: anime };
  try {
    await db.aniListCache.upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        anilistId: anime.id,
        operation: "Media",
        response: data,
        source: "anilist-bulk-seed",
        hits: 0,
        errorCount: 0,
      },
      update: {
        response: data,
        source: "anilist-bulk-seed",
        updatedAt: new Date(),
        errorCount: 0,
      },
    });
    return true;
  } catch (e) {
    console.warn(`[anime ${anime.id}] DB save failed: ${e.message.slice(0, 80)}`);
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Run a batch of pages in parallel ──
async function processPageBatch(pageNums) {
  const results = await Promise.all(
    pageNums.map(async (pageNum) => {
      const page = await fetchPage(pageNum);
      if (!page?.media?.length) return 0;
      let saved = 0;
      for (const anime of page.media) {
        if (await saveAnimeToCache(anime)) saved++;
      }
      return saved;
    })
  );
  return results.reduce((a, b) => a + b, 0);
}

// ── Main ──
async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  AniList Database Seeder");
  console.log("  Fetching all ~22,000 anime with FULL detail metadata");
  console.log("═══════════════════════════════════════════════════════\n");

  // Get current count
  const before = await db.aniListCache.count();
  console.log(`[start] DB has ${before.toLocaleString()} entries\n`);

  // First, fetch page 1 to get total page count
  const firstPage = await fetchPage(1);
  if (!firstPage) {
    console.error("Failed to fetch first page — aborting");
    process.exit(1);
  }
  const totalPages = firstPage.pageInfo?.lastPage || 440;
  const totalAnime = firstPage.pageInfo?.total || 22000;
  console.log(`[info] AniList has ${totalAnime.toLocaleString()} anime across ${totalPages} pages (50 per page)\n`);

  // Save page 1's anime first
  let totalSaved = 0;
  for (const anime of firstPage.media) {
    if (await saveAnimeToCache(anime)) totalSaved++;
  }
  console.log(`[page 1] +${firstPage.media.length} anime (total saved: ${totalSaved.toLocaleString()})`);

  // Process remaining pages with concurrency 3
  const CONCURRENCY = 3;
  const allPageNums = [];
  for (let p = 2; p <= totalPages; p++) allPageNums.push(p);

  let processed = 1; // page 1 already done
  const startTime = Date.now();

  for (let i = 0; i < allPageNums.length; i += CONCURRENCY) {
    const batch = allPageNums.slice(i, i + CONCURRENCY);
    const saved = await processPageBatch(batch);
    totalSaved += saved;
    processed += batch.length;

    // Progress every 10 pages
    if (processed % 10 < CONCURRENCY) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = totalSaved / elapsed;
      const remaining = totalAnime - totalSaved;
      const eta = remaining / rate / 60;
      const after = await db.aniListCache.count();
      console.log(
        `[page ${processed}/${totalPages}] saved ${totalSaved.toLocaleString()} anime ` +
        `(${rate.toFixed(1)}/s, ETA ${eta.toFixed(1)}min, DB now ${after.toLocaleString()})`
      );
    }
  }

  const after = await db.aniListCache.count();
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  ✓ DONE — saved ${totalSaved.toLocaleString()} anime`);
  console.log(`  DB before: ${before.toLocaleString()} entries`);
  console.log(`  DB after:  ${after.toLocaleString()} entries`);
  console.log(`  Time: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);
  console.log(`═══════════════════════════════════════════════════════`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
