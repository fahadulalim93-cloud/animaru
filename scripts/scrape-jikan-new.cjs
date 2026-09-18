/**
 * Scrape Jikan API for NEW anime not in our SQLite DB.
 * 
 * Strategy:
 * 1. Get all anime IDs from Jikan (MAL API) — ~24K entries
 * 2. For each, check if its AniList ID is already in our DB
 * 3. If missing, fetch full data and insert
 * 
 * Run on VPS:
 *   docker exec -d <container> node --experimental-sqlite /app/scripts/scrape-jikan-new.cjs
 */
const { DatabaseSync } = require("node:sqlite");
const https = require("https");

const DB_PATH = "/data/anime-db.sqlite";
const JIKAN_BASE = "https://api.jikan.moe/v4";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, json: null }); }
      });
    }).on("error", reject);
  });
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const r = await fetch(url);
    if (r.status === 200) return r;
    if (r.status === 429 || r.status === 504 || r.status === 503) {
      console.log(`  Retry ${i+1}/${maxRetries} (HTTP ${r.status})...`);
      await sleep(2000 * (i + 1));
      continue;
    }
    return r;
  }
  return { status: 0, json: null };
}

function jikanToAniList(malAnime) {
  const malId = malAnime.mal_id;
  return {
    Media: {
      id: malId,
      idMal: malId,
      title: {
        romaji: malAnime.title || malAnime.title_japanese,
        english: malAnime.title_english || malAnime.title,
        native: malAnime.title_japanese,
      },
      coverImage: {
        extraLarge: malAnime.images?.jpg?.large_image_url,
        large: malAnime.images?.jpg?.large_image_url,
        medium: malAnime.images?.jpg?.image_url,
      },
      bannerImage: malAnime.images?.jpg?.large_image_url,
      description: malAnime.synopsis,
      type: malAnime.type === "TV" ? "TV" : malAnime.type,
      format: malAnime.type,
      status: malAnime.status === "Finished Airing" ? "FINISHED" :
              malAnime.status === "Currently Airing" ? "RELEASING" :
              malAnime.status === "Not yet aired" ? "NOT_YET_RELEASED" : "FINISHED",
      episodes: malAnime.episodes,
      duration: null,
      genres: malAnime.genres?.map(g => g.name) || [],
      averageScore: malAnime.score ? Math.round(malAnime.score * 10) : null,
      meanScore: malAnime.score ? Math.round(malAnime.score * 10) : null,
      popularity: malAnime.members || 0,
      trending: 0,
      favourites: malAnime.favorites || 0,
      season: malAnime.season ? malAnime.season.toUpperCase() : null,
      seasonYear: malAnime.year || null,
      countryOfOrigin: "JP",
      isAdult: false,
      source: malAnime.source,
      siteUrl: malAnime.url,
      nextAiringEpisode: null,
      streamingEpisodes: [],
      studios: { nodes: (malAnime.studios || []).map(s => ({ id: s.mal_id, name: s.name, isAnimationStudio: true })) },
      characters: { edges: [] },
      recommendations: { nodes: [] },
      relations: { edges: [] },
    },
  };
}

async function main() {
  const db = new DatabaseSync(DB_PATH);

  const count = db.prepare("SELECT COUNT(*) as c FROM anime").get();
  const maxId = db.prepare("SELECT MAX(anilist_id) as m FROM anime").get();
  console.log(`Current DB: ${count.c} anime, max AniList ID: ${maxId.m}`);

  // Get all existing MAL IDs
  const existingMalIds = new Set();
  const allRows = db.prepare("SELECT mal_id FROM anime WHERE mal_id IS NOT NULL").all();
  for (const r of allRows) {
    if (r.mal_id) existingMalIds.add(r.mal_id);
  }
  console.log(`Existing MAL IDs in DB: ${existingMalIds.size}`);

  let page = 1;
  let totalAdded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  while (true) {
    // Sort by mal_id ascending to get oldest first, then newer ones
    const url = `${JIKAN_BASE}/anime?page=${page}&limit=25&sfw=true&order_by=mal_id&sort=asc`;
    
    const r = await fetchWithRetry(url);
    if (r.status !== 200 || !r.json?.data) {
      console.log(`Page ${page}: HTTP ${r.status}, stopping`);
      break;
    }

    const items = r.json.data;
    const hasNext = r.json.pagination?.has_next_page;

    let pageAdded = 0;
    for (const malAnime of items) {
      const malId = malAnime.mal_id;

      if (existingMalIds.has(malId)) {
        totalSkipped++;
        continue;
      }

      const anilistData = jikanToAniList(malAnime);
      const media = anilistData.Media;

      try {
        db.prepare(`
          INSERT OR REPLACE INTO anime (anilist_id, mal_id, title_romaji, title_english, title_native, poster, banner, description, episodes, format, status, genres, average_score, season_year, season, raw_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          malId,
          malId,
          media.title.romaji,
          media.title.english,
          media.title.native,
          media.coverImage?.large,
          media.bannerImage,
          media.description,
          media.episodes,
          media.format,
          media.status,
          JSON.stringify(media.genres),
          media.averageScore,
          media.seasonYear,
          media.season,
          JSON.stringify(anilistData),
        );
        existingMalIds.add(malId);
        totalAdded++;
        pageAdded++;
      } catch (e) {
        totalErrors++;
      }
    }

    if (pageAdded > 0) {
      console.log(`Page ${page}: +${pageAdded} new (total: ${totalAdded}, skipped: ${totalSkipped})`);
    }

    if (!hasNext) {
      console.log("No more pages");
      break;
    }
    page++;
    // Jikan rate limit: 3 req/sec, use 500ms delay
    await sleep(500);
    
    // Log progress every 100 pages
    if (page % 100 === 0) {
      console.log(`--- Progress: page ${page}, added ${totalAdded}, skipped ${totalSkipped} ---`);
    }
  }

  const finalCount = db.prepare("SELECT COUNT(*) as c FROM anime").get();
  console.log(`\nDone! Added ${totalAdded} new anime (skipped ${totalSkipped}, errors: ${totalErrors})`);
  console.log(`DB now has ${finalCount.c} anime (was ${count.c})`);

  db.close();
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
