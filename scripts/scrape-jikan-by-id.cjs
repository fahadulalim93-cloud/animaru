/**
 * Scrape Jikan API by individual MAL ID — fetches /anime/{id}/full
 * for IDs > 64216 (our max) up to ~70000.
 * 
 * This is the only Jikan endpoint that works (the listing endpoint returns 504).
 * 
 * Run on VPS:
 *   docker exec -d <container> node --experimental-sqlite /app/scripts/scrape-jikan-by-id.cjs
 */
const { DatabaseSync } = require("node:sqlite");
const https = require("https");

const DB_PATH = "/data/anime-db.sqlite";
const START_ID = 64217;  // Our max MAL ID + 1
const END_ID = 70000;    // Fetch up to MAL ID 70000 (~5800 anime)
const DELAY_MS = 400;    // 2.5 req/sec (Jikan limit: 3 req/sec)

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
    if (r.status === 429 || r.status === 504 || r.status === 503) {
      await sleep(2000 * (i + 1));
      continue;
    }
    if (r.status === 404) return r; // Anime doesn't exist, skip
    return r; // Other errors
  }
  return { status: 0, json: null };
}

function jikanToAniList(malAnime) {
  return {
    Media: {
      id: malAnime.mal_id,
      idMal: malAnime.mal_id,
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
  console.log(`Starting: DB has ${count.c} anime`);
  console.log(`Fetching MAL IDs ${START_ID} to ${END_ID} (${END_ID - START_ID + 1} IDs)...`);

  let totalAdded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (let malId = START_ID; malId <= END_ID; malId++) {
    // Check if already in DB
    const existing = db.prepare("SELECT mal_id FROM anime WHERE mal_id = ?").get(malId);
    if (existing) {
      totalSkipped++;
      continue;
    }

    const url = `https://api.jikan.moe/v4/anime/${malId}/full`;
    const r = await fetchWithRetry(url);

    if (r.status === 404) {
      totalSkipped++;
      continue;
    }

    if (r.status !== 200 || !r.json?.data) {
      totalErrors++;
      if (totalErrors % 10 === 0) {
        console.log(`  Error at MAL ID ${malId}: HTTP ${r.status} (errors: ${totalErrors})`);
      }
      await sleep(DELAY_MS);
      continue;
    }

    const anilistData = jikanToAniList(r.json.data);
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
      totalAdded++;
      
      if (totalAdded % 50 === 0) {
        console.log(`Added ${totalAdded} new anime (current: MAL ID ${malId}, ${media.title.english || media.title.romaji})`);
      }
    } catch (e) {
      totalErrors++;
    }

    await sleep(DELAY_MS);
  }

  const finalCount = db.prepare("SELECT COUNT(*) as c FROM anime").get();
  console.log(`\nDone! Added ${totalAdded} new anime (skipped ${totalSkipped}, errors: ${totalErrors})`);
  console.log(`DB now has ${finalCount.c} anime (was ${count.c})`);

  db.close();
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
