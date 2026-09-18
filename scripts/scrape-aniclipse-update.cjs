/**
 * UPDATE existing anime in our SQLite DB with fresh data from aniclipse.com.
 *
 * Why UPDATE instead of just adding new ones?
 * - AniList API is currently down (severe stability issues — 403)
 * - Our DB was scraped months ago; many newer anime have stale data:
 *   - episodes = null (anime was ongoing when scraped, has since finished)
 *   - bannerImage = null (some anime didn't have banners when first scraped)
 *   - nextAiringEpisode = null/old
 * - Aniclipse runs a fresh mirror of AniList data, so its responses reflect
 *   current state (final episode counts for finished series, etc.)
 *
 * Strategy:
 *   1. Fetch all 1,103 pages of aniclipse search results
 *   2. For each anime:
 *      - If anilist_id NOT in our DB → INSERT (the old behavior)
 *      - If anilist_id IS in our DB → check if our data is "stale"
 *        (missing episodes, or bannerImage, or nextAiringEpisode for RELEASING)
 *        → if stale, UPDATE raw_json with merged data
 *   3. Prioritize anime with status=RELEASING or NOT_YET_RELEASED
 *      (those are most likely to have stale episode counts)
 *
 * Run on VPS:
 *   docker exec -d <container> node --experimental-sqlite /app/scripts/scrape-aniclipse-update.cjs
 */
const { DatabaseSync } = require("node:sqlite");
const https = require("https");

const DB_PATH = "/data/anime-db.sqlite";
const BASE = "https://aniclipse.com";
const TOTAL_PAGES = 1103;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function fetch(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, json: null }); }
      });
    }).on("error", (e) => resolve({ status: 0, json: null, error: e.message }));
  });
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const r = await fetch(url);
    if (r.status === 200) return r;
    if (r.status === 429) {
      console.log(`  Rate limited, waiting 5s...`);
      await sleep(5000);
      continue;
    }
    console.log(`  Retry ${i+1}/${maxRetries} (HTTP ${r.status})...`);
    await sleep(2000 * (i + 1));
  }
  return { status: 0, json: null };
}

/**
 * Check if our existing data for an anime is stale.
 * Returns the fields that need updating.
 */
function findStaleFields(existingRawJson, newMedia) {
  let existingMedia = null;
  try {
    const parsed = JSON.parse(existingRawJson);
    existingMedia = parsed.Media || parsed;
  } catch { return null; }
  if (!existingMedia) return null;

  const updates = {};
  let needsUpdate = false;

  // episodes — critical: if our copy has null or 0 but new has a number
  if ((!existingMedia.episodes || existingMedia.episodes === 0) && newMedia.episodes && newMedia.episodes > 0) {
    updates.episodes = newMedia.episodes;
    needsUpdate = true;
  }
  // If our episode count is wrong (lower than nextAiringEpisode.episode - 1)
  if (newMedia.nextAiringEpisode && newMedia.nextAiringEpisode.episode) {
    const aired = newMedia.nextAiringEpisode.episode - 1;
    if ((!existingMedia.episodes || existingMedia.episodes < aired) && aired > 0) {
      updates.episodes = aired;
      needsUpdate = true;
    }
    updates.nextAiringEpisode = newMedia.nextAiringEpisode;
    needsUpdate = true;
  }

  // bannerImage
  if (!existingMedia.bannerImage && newMedia.bannerImage) {
    updates.bannerImage = newMedia.bannerImage;
    needsUpdate = true;
  }

  // coverImage — sometimes our copy is missing extraLarge
  if (newMedia.coverImage) {
    const ours = existingMedia.coverImage || {};
    const theirs = newMedia.coverImage;
    if ((!ours.extraLarge && theirs.extraLarge) || (!ours.large && theirs.large)) {
      updates.coverImage = { ...ours, ...theirs };
      needsUpdate = true;
    }
  }

  // description
  if (!existingMedia.description && newMedia.description) {
    updates.description = newMedia.description;
    needsUpdate = true;
  }

  // genres
  if ((!existingMedia.genres || existingMedia.genres.length === 0) && newMedia.genres && newMedia.genres.length > 0) {
    updates.genres = newMedia.genres;
    needsUpdate = true;
  }

  // averageScore
  if ((!existingMedia.averageScore || existingMedia.averageScore === 0) && newMedia.averageScore) {
    updates.averageScore = newMedia.averageScore;
    needsUpdate = true;
  }

  // seasonYear
  if (!existingMedia.seasonYear && newMedia.seasonYear) {
    updates.seasonYear = newMedia.seasonYear;
    needsUpdate = true;
  }

  // status — RELEASING → FINISHED transition
  if (existingMedia.status !== newMedia.status && newMedia.status === "FINISHED") {
    updates.status = newMedia.status;
    needsUpdate = true;
  }

  return needsUpdate ? updates : null;
}

async function main() {
  const db = new DatabaseSync(DB_PATH);

  const count = db.prepare("SELECT COUNT(*) as c FROM anime").get();
  console.log(`Starting: DB has ${count.c} anime`);

  // Get existing AniList IDs → raw_json
  const existingMap = new Map();
  const allRows = db.prepare("SELECT anilist_id, raw_json, episodes FROM anime").all();
  for (const r of allRows) {
    if (r.anilist_id) existingMap.set(r.anilist_id, r);
  }
  console.log(`Existing AniList IDs: ${existingMap.size}`);

  let totalAdded = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalProcessed = 0;

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const url = `${BASE}/api/anime/search?q=a&page=${page}`;
    const r = await fetchWithRetry(url);

    if (r.status !== 200 || !r.json?.data?.Page?.media) {
      console.log(`Page ${page}: HTTP ${r.status}, skipping`);
      totalErrors++;
      await sleep(1000);
      continue;
    }

    const media = r.json.data.Page.media;
    let pageAdded = 0;
    let pageUpdated = 0;

    for (const m of media) {
      const anilistId = parseInt(m.id);
      if (!anilistId) continue;
      totalProcessed++;

      const existing = existingMap.get(anilistId);

      if (!existing) {
        // ── INSERT new anime ──
        try {
          const anilistData = { Media: m };
          db.prepare(`
            INSERT OR REPLACE INTO anime (anilist_id, mal_id, title_romaji, title_english, title_native, poster, episodes, status, format, genres, synopsis, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            anilistId,
            m.idMal || null,
            m.title?.romaji || null,
            m.title?.english || null,
            m.title?.native || null,
            m.coverImage?.large || m.coverImage?.medium || null,
            m.episodes || null,
            m.status || null,
            m.format || null,
            m.genres ? JSON.stringify(m.genres) : null,
            m.description || null,
            JSON.stringify(anilistData),
          );
          existingMap.set(anilistId, { anilist_id: anilistId, raw_json: JSON.stringify(anilistData), episodes: m.episodes || null });
          totalAdded++;
          pageAdded++;
        } catch (e) {
          totalErrors++;
        }
        continue;
      }

      // ── Check for stale fields in existing entry ──
      const updates = findStaleFields(existing.raw_json, m);
      if (!updates) {
        totalSkipped++;
        continue;
      }

      // Merge: take existing raw_json + apply updates
      try {
        const parsed = JSON.parse(existing.raw_json);
        const existingMedia = parsed.Media || parsed;
        const mergedMedia = { ...existingMedia, ...updates };

        // Also update the denormalized columns so SQL queries work
        const newEpisodes = updates.episodes !== undefined ? updates.episodes : existing.episodes;
        const newStatus = updates.status !== undefined ? updates.status : existingMedia.status;
        const newGenres = updates.genres !== undefined ? JSON.stringify(updates.genres) : (existingMedia.genres ? JSON.stringify(existingMedia.genres) : null);
        const newSynopsis = updates.description !== undefined ? updates.description : (existingMedia.description || null);
        const newPoster = updates.coverImage?.large || updates.coverImage?.medium || existingMedia.coverImage?.large || existingMedia.coverImage?.medium || existing.poster;

        db.prepare(`
          UPDATE anime
          SET raw_json = ?,
              episodes = ?,
              status = COALESCE(?, status),
              genres = COALESCE(?, genres),
              synopsis = COALESCE(?, synopsis),
              poster = COALESCE(?, poster)
          WHERE anilist_id = ?
        `).run(
          JSON.stringify({ Media: mergedMedia }),
          newEpisodes,
          newStatus,
          newGenres,
          newSynopsis,
          newPoster,
          anilistId,
        );
        existingMap.set(anilistId, { anilist_id: anilistId, raw_json: JSON.stringify({ Media: mergedMedia }), episodes: newEpisodes });
        totalUpdated++;
        pageUpdated++;
      } catch (e) {
        totalErrors++;
      }
    }

    if (pageAdded > 0 || pageUpdated > 0 || page % 100 === 0) {
      console.log(`Page ${page}/${TOTAL_PAGES}: +${pageAdded} new, ~${pageUpdated} updated (totals: ${totalAdded} added, ${totalUpdated} updated, ${totalSkipped} skipped, ${totalErrors} errors, ${totalProcessed} processed)`);
    }

    // 200ms delay (5 req/sec — aniclipse is fast, no rate limit)
    await sleep(200);
  }

  const finalCount = db.prepare("SELECT COUNT(*) as c FROM anime").get();
  console.log(`\nDone!`);
  console.log(`  Added: ${totalAdded} new anime`);
  console.log(`  Updated: ${totalUpdated} existing anime with fresh data`);
  console.log(`  Skipped (already fresh): ${totalSkipped}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log(`DB now has ${finalCount.c} anime (was ${count.c})`);

  db.close();
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
