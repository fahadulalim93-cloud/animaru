/**
 * Scrape aniclipse.com API for ALL anime and add missing ones to our SQLite DB.
 * 
 * Aniclipse has an AniList-compatible API:
 *   /api/anime/search?q=a&page=N  → returns AniList Page format
 *   22,048 total anime, 1,103 pages of 20
 * 
 * Each anime has full AniList data (id, title, coverImage, bannerImage, 
 * description, episodes, genres, score, season, etc.)
 * 
 * Run on VPS:
 *   docker exec -d <container> node --experimental-sqlite /app/scripts/scrape-aniclipse.cjs
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
    console.log(`  Retry ${i+1}/${maxRetries} (HTTP ${r.status})...`);
    await sleep(2000 * (i + 1));
  }
  return { status: 0, json: null };
}

async function main() {
  const db = new DatabaseSync(DB_PATH);
  
  const count = db.prepare("SELECT COUNT(*) as c FROM anime").get();
  console.log(`Starting: DB has ${count.c} anime`);
  
  // Get existing AniList IDs
  const existingIds = new Set();
  const allRows = db.prepare("SELECT anilist_id FROM anime").all();
  for (const r of allRows) {
    if (r.anilist_id) existingIds.add(r.anilist_id);
  }
  console.log(`Existing AniList IDs: ${existingIds.size}`);

  let totalAdded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

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

    for (const m of media) {
      const anilistId = parseInt(m.id);
      if (!anilistId || existingIds.has(anilistId)) {
        totalSkipped++;
        continue;
      }

      // Build the raw_json in AniList GraphQL format
      const anilistData = { Media: m };

      try {
        db.prepare(`
          INSERT OR REPLACE INTO anime (anilist_id, mal_id, title_romaji, title_english, title_native, poster, banner, description, episodes, format, status, genres, average_score, season_year, season, raw_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          anilistId,
          m.idMal || null,
          m.title?.romaji,
          m.title?.english,
          m.title?.native,
          m.coverImage?.large,
          m.bannerImage,
          m.description,
          m.episodes,
          m.format,
          m.status,
          m.genres ? JSON.stringify(m.genres) : null,
          m.averageScore,
          m.seasonYear,
          m.season,
          JSON.stringify(anilistData),
        );
        existingIds.add(anilistId);
        totalAdded++;
        pageAdded++;
      } catch (e) {
        totalErrors++;
      }
    }

    if (pageAdded > 0 || page % 100 === 0) {
      console.log(`Page ${page}/${TOTAL_PAGES}: +${pageAdded} new (total: ${totalAdded}, skipped: ${totalSkipped})`);
    }

    // 200ms delay (5 req/sec — aniclipse is fast, no rate limit)
    await sleep(200);
  }

  const finalCount = db.prepare("SELECT COUNT(*) as c FROM anime").get();
  console.log(`\nDone! Added ${totalAdded} new anime (skipped ${totalSkipped}, errors: ${totalErrors})`);
  console.log(`DB now has ${finalCount.c} anime (was ${count.c})`);

  db.close();
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
