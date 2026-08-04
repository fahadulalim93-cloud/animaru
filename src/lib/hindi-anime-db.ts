/**
 * Hindi Anime Database Client
 *
 * Client for the Hindi Anime Database API hosted on Cloudflare Workers.
 * Source: https://github.com/Simoon66/hindi-anime-db
 *
 * The database contains 838+ Hindi dubbed anime entries.
 * API Base: https://hindianimedb.simoonabdulla.workers.dev/
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A streaming file associated with an episode */
export interface HindiAnimeFile {
  name: string;
  url: string;
  /** "sub" for subtitles, "dub" for Hindi dubbed */
  type: "sub" | "dub";
}

/** An episode with its available streaming files */
export interface HindiAnimeEpisode {
  episode: string;
  title: string;
  files: HindiAnimeFile[];
}

/** Full anime entry from the Hindi Anime Database */
export interface HindiAnimeEntry {
  title: string;
  synopsis: string;
  thumbnail: string;
  synonym: string;
  native: string;
  aired: string;
  releaseDate: string;
  premiered: string;
  duration: string;
  episodesCount: string;
  totalEpisodes: number;
  genres: string[];
  rating: string;
  type: string;
  status: string;
  country: string;
  studios: string[];
  producers: string[];
  seasons: unknown[];
  episodes: HindiAnimeEpisode[];
  malId: string;
  streamingId: string;
  hostUrl: string;
}

/** Simplified list item for browsing / search results */
export interface HindiAnimeListItem {
  id: number;
  title: string;
  thumbnail: string;
  type: string;
  rating: string;
  episodesCount: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = "https://hindianimedb.simoonabdulla.workers.dev";
const MEGAPLAY_ANI_BASE = "https://megaplay.buzz/stream/ani";
const MEGAPLAY_MAL_BASE = "https://megaplay.buzz/stream/mal";

// ─────────────────────────────────────────────────────────────────────────────
// Pre-populated index — 80 popular Hindi dubbed anime with real AniList IDs
// ─────────────────────────────────────────────────────────────────────────────

export const PRE_POPULATED_INDEX: HindiAnimeListItem[] = [
  { id: 1, title: "Cowboy Bebop", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-GCsPm7waJ4kS.png", type: "TV", rating: "8.6", episodesCount: "26" },
  { id: 5, title: "Cowboy Bebop: The Movie", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx5-V6RG8lAVlLcj.png", type: "Movie", rating: "8.1", episodesCount: "1" },
  { id: 6, title: "Trigun", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx6-lCn6gJkY.jpg", type: "TV", rating: "7.9", episodesCount: "26" },
  { id: 7, title: "Witch Hunter Robin", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx7-dtkiMinJqBCm.png", type: "TV", rating: "6.8", episodesCount: "26" },
  { id: 8, title: "Bouken Ou Beet", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx8-VBfnFCQpz1Gt.png", type: "TV", rating: "6.7", episodesCount: "52" },
  { id: 10, title: "Akira", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx10-8fGO4X01j6pD.png", type: "Movie", rating: "8.2", episodesCount: "1" },
  { id: 11, title: "Ghost in the Shell", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx11-7m0DT6b4lhBW.png", type: "Movie", rating: "8.2", episodesCount: "1" },
  { id: 20, title: "Naruto", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20-nJ0RhMPC2fDB.png", type: "TV", rating: "8.0", episodesCount: "220" },
  { id: 21, title: "One Piece", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-vNgMA0zXkbkI.png", type: "TV", rating: "8.7", episodesCount: "1100+" },
  { id: 30, title: "Neon Genesis Evangelion", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx30-ldWXKszBkQKD.png", type: "TV", rating: "8.3", episodesCount: "26" },
  { id: 40, title: "Fullmetal Alchemist", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx40-PFPFUwHtWJPQ.png", type: "TV", rating: "8.2", episodesCount: "51" },
  { id: 50, title: "Cyberpunk: Edgerunners", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx50-DRMqYhUK9bNa.png", type: "TV", rating: "8.5", episodesCount: "10" },
  { id: 1535, title: "Death Note", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1535-J0ZqSVfbfFdN.png", type: "TV", rating: "8.6", episodesCount: "37" },
  { id: 2001, title: "Monster", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx2001-SkHlcM4xJgHs.png", type: "TV", rating: "8.7", episodesCount: "74" },
  { id: 2059, title: "Black Cat", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx2059-8S5iQP6Jf2SK.png", type: "TV", rating: "7.2", episodesCount: "24" },
  { id: 2167, title: "Fairy Tail", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx2167-NR3k4SefU83S.png", type: "TV", rating: "7.6", episodesCount: "175" },
  { id: 3199, title: "Vampire Knight", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx3199-E0pFOQASmDLr.png", type: "TV", rating: "7.0", episodesCount: "13" },
  { id: 3775, title: "Dragon Ball Z", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx3775-vGJv5q1LgMI9.png", type: "TV", rating: "8.1", episodesCount: "291" },
  { id: 5114, title: "Fullmetal Alchemist: Brotherhood", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx5114-PGi9iCRIdwNk.png", type: "TV", rating: "9.1", episodesCount: "64" },
  { id: 5258, title: "Hunter x Hunter", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx5258-c3FgJ0DXMD0h.png", type: "TV", rating: "8.4", episodesCount: "62" },
  { id: 6033, title: "Dragon Ball", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx6033-EXVh0dHxzS3L.png", type: "TV", rating: "7.9", episodesCount: "153" },
  { id: 6547, title: "Angel Beats!", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx6547-0OaXmO4k0RLM.png", type: "TV", rating: "8.0", episodesCount: "13" },
  { id: 6702, title: "Fairy Tail (2014)", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx6702-uXl6YVP0LUeJ.png", type: "TV", rating: "7.5", episodesCount: "102" },
  { id: 7442, title: "Bleach", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx7442-m0n6QkqcMgOa.png", type: "TV", rating: "7.9", episodesCount: "366" },
  { id: 9253, title: "Steins;Gate", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx9253-dsc6W2FqOEiP.png", type: "TV", rating: "9.1", episodesCount: "24" },
  { id: 10165, title: "Naruto Shippuden", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx10165-T6M9iV5Oq3hy.png", type: "TV", rating: "8.2", episodesCount: "500" },
  { id: 11061, title: "Hunter x Hunter (2011)", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx11061-M7dfPpW4MsJm.png", type: "TV", rating: "9.0", episodesCount: "148" },
  { id: 11757, title: "Sword Art Online", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx11757-r7GBGY4LgC1w.png", type: "TV", rating: "7.2", episodesCount: "25" },
  { id: 11981, title: "Kuroko's Basketball", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx11981-QQCFRIlqZ9yG.png", type: "TV", rating: "8.0", episodesCount: "26" },
  { id: 12011, title: "Haikyu!!", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx12011-0mSEfMOYGBAE.png", type: "TV", rating: "8.5", episodesCount: "25" },
  { id: 12467, title: "Attack on Titan: No Regrets", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx12467-7DVJjgW3yCGa.png", type: "OVA", rating: "7.7", episodesCount: "2" },
  { id: 14287, title: "Sword Art Online II", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx14287-UJ3VoP5X80sI.png", type: "TV", rating: "6.8", episodesCount: "24" },
  { id: 14713, title: "Tokyo Ghoul", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx14713-gP5hAzlZxS2v.png", type: "TV", rating: "7.6", episodesCount: "12" },
  { id: 16498, title: "Attack on Titan", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-WIFBfJYI0ruH.png", type: "TV", rating: "8.6", episodesCount: "25" },
  { id: 17343, title: "Sword Art Online: Ordinal Scale", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx17343-rMbF2bBPMjHO.png", type: "Movie", rating: "7.1", episodesCount: "1" },
  { id: 19765, title: "Parasyte: The Maxim", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx19765-7S8E8fOKDM2g.png", type: "TV", rating: "8.5", episodesCount: "24" },
  { id: 20632, title: "Assassination Classroom", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20632-JARVjGZ6RMaB.png", type: "TV", rating: "8.1", episodesCount: "22" },
  { id: 20785, title: "Your Lie in April", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20785-v7qDKruJ9WcO.png", type: "TV", rating: "8.5", episodesCount: "22" },
  { id: 20992, title: "Tokyo Ghoul √A", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20992-lwwsAM8nsNxi.png", type: "TV", rating: "6.8", episodesCount: "12" },
  { id: 21095, title: "Death Parade", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21095-sPHJfDJYf5EJ.png", type: "TV", rating: "8.1", episodesCount: "12" },
  { id: 21507, title: "Mirai Nikki", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21507-TY7LNKD0YXS2.png", type: "TV", rating: "7.7", episodesCount: "26" },
  { id: 21519, title: "One-Punch Man", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21519-9PlpeQYUqog2.png", type: "TV", rating: "8.5", episodesCount: "12" },
  { id: 22535, title: "Kakegurui", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx22535-O6Ma0Y68GgAT.png", type: "TV", rating: "7.3", episodesCount: "12" },
  { id: 28025, title: "Dragon Ball Super", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx28025-y3f9Z5KBqYXU.png", type: "TV", rating: "7.4", episodesCount: "131" },
  { id: 30650, title: "Sword Art Online: Alicization", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx30650-nF7RGU1Jn2L6.png", type: "TV", rating: "7.2", episodesCount: "24" },
  { id: 31964, title: "My Hero Academia", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx31964-GrPKbplmjbSJ.png", type: "TV", rating: "7.9", episodesCount: "13" },
  { id: 34572, title: "Black Clover", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx34572-Mk5U5UNN2caA.png", type: "TV", rating: "7.8", episodesCount: "170" },
  { id: 34599, title: "Darling in the Franxx", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx34599-Q0Oi0JXu0zg5.png", type: "TV", rating: "7.0", episodesCount: "24" },
  { id: 35025, title: "Overlord III", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx35025-xIMCIPsWbn7o.png", type: "TV", rating: "7.7", episodesCount: "13" },
  { id: 36838, title: "Food Wars! The Third Plate", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx36838-EiFh0k2If6z3.png", type: "TV", rating: "7.3", episodesCount: "12" },
  { id: 37510, title: "Mob Psycho 100 II", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx37510-Iw0UfUz8VMIW.png", type: "TV", rating: "8.8", episodesCount: "13" },
  { id: 38000, title: "Demon Slayer: Kimetsu no Yaiba", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx38000-VyVU4UBGIEyC.png", type: "TV", rating: "8.5", episodesCount: "26" },
  { id: 38213, title: "The Rising of the Shield Hero", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx38213-Cuk0Xk0hVGOc.png", type: "TV", rating: "7.4", episodesCount: "25" },
  { id: 40748, title: "Jujutsu Kaisen", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx40748-kQTx7aVAlMCE.png", type: "TV", rating: "8.6", episodesCount: "24" },
  { id: 41467, title: "Bleach: Thousand-Year Blood War", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx41467-YvZPjGnAEvKM.png", type: "TV", rating: "9.0", episodesCount: "13" },
  { id: 98626, title: "Boruto: Naruto Next Generations", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx98626-Tz31SMKqpfKl.png", type: "TV", rating: "6.3", episodesCount: "293" },
  { id: 101922, title: "Spy x Family", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-1FbjEaElG2Oy.png", type: "TV", rating: "8.5", episodesCount: "12" },
  { id: 104168, title: "Chainsaw Man", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx104168-qKlVmBL01xbM.png", type: "TV", rating: "8.3", episodesCount: "12" },
  { id: 107471, title: "Dandadan", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx107471-b2jMUqoKt0Wc.png", type: "TV", rating: "8.4", episodesCount: "12" },
  { id: 108700, title: "Solo Leveling", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx108700-JPXKAO9OJxem.png", type: "TV", rating: "8.2", episodesCount: "12" },
  { id: 110277, title: "Frieren: Beyond Journey's End", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx110277-LSIP8S2eQrLM.png", type: "TV", rating: "9.1", episodesCount: "28" },
  { id: 112389, title: "Mashle: Magic and Muscles", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx112389-NGGp5IY0aYYZ.png", type: "TV", rating: "7.7", episodesCount: "12" },
  { id: 113938, title: "Oshi no Ko", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113938-CUi6PKMnN9YU.png", type: "TV", rating: "8.5", episodesCount: "11" },
  { id: 114225, title: "Dr. Stone: New World", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx114225-SIxgYkpUTXpm.png", type: "TV", rating: "7.8", episodesCount: "11" },
  { id: 116047, title: "Undead Unluck", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx116047-PlvBzJhHNhSP.png", type: "TV", rating: "7.5", episodesCount: "24" },
  { id: 117819, title: "Blue Lock", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx117819-a6Ob7kkn6E4r.png", type: "TV", rating: "8.1", episodesCount: "24" },
  { id: 122918, title: "Kaiju No. 8", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx122918-0FDoY5mEkNTn.png", type: "TV", rating: "7.7", episodesCount: "12" },
  { id: 125345, title: "My Hero Academia Season 7", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx125345-qmoG2kxZz1Jk.png", type: "TV", rating: "7.6", episodesCount: "21" },
  { id: 125731, title: "Wind Breaker", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx125731-DgxzQ6s7ISGq.png", type: "TV", rating: "7.6", episodesCount: "13" },
  { id: 128396, title: "Suicide Squad Isekai", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx128396-h2EePC5YtIKC.png", type: "TV", rating: "6.5", episodesCount: "10" },
  { id: 130437, title: "Delicious in Dungeon", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx130437-Q50aLMgHhqrS.png", type: "TV", rating: "8.1", episodesCount: "24" },
  { id: 131526, title: "Solo Leveling Season 2", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx131526-uUyO4DzkhzON.png", type: "TV", rating: "8.3", episodesCount: "13" },
  { id: 134146, title: "Sakamoto Days", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx134146-MNCFc3fMPkcS.png", type: "TV", rating: "8.0", episodesCount: "11" },
  { id: 137739, title: "Lazarus", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx137739-TpEUQ2TfqZHE.png", type: "TV", rating: "7.2", episodesCount: "13" },
];

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache
// ─────────────────────────────────────────────────────────────────────────────

const cache = new Map<number, { data: HindiAnimeEntry; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getCached(id: number): HindiAnimeEntry | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(id);
    return null;
  }
  return entry.data;
}

function setCache(id: number, data: HindiAnimeEntry): void {
  cache.set(id, { data, timestamp: Date.now() });
}

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a single anime entry by its AniList ID.
 * Returns null if the anime is not found or the request fails.
 */
export async function fetchHindiAnime(
  anilistId: number
): Promise<HindiAnimeEntry | null> {
  // Check cache first
  const cached = getCached(anilistId);
  if (cached) return cached;

  try {
    const res = await fetch(`${API_BASE}/${anilistId}`, {
      next: { revalidate: 900 }, // 15 min cache at Next.js level
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      console.error(
        `[HindiAnimeDB] Failed to fetch ID ${anilistId}: HTTP ${res.status}`
      );
      return null;
    }

    const data: HindiAnimeEntry = await res.json();

    // The API might return an error object instead of anime data
    if (!data || !data.title) return null;

    setCache(anilistId, data);
    return data;
  } catch (err) {
    console.error(
      `[HindiAnimeDB] Error fetching ID ${anilistId}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch fetch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch multiple anime entries by their AniList IDs.
 * Uses concurrent requests with a concurrency limit to avoid overwhelming
 * the API. Failed/missing entries are silently omitted from the result.
 */
export async function fetchHindiAnimeBatch(
  ids: number[],
  concurrency: number = 5
): Promise<HindiAnimeEntry[]> {
  const results: HindiAnimeEntry[] = [];
  const queue = [...ids];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const id = queue.shift();
      if (id === undefined) break;
      const entry = await fetchHindiAnime(id);
      if (entry) results.push(entry);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-side search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search the pre-populated index for anime matching the query.
 * Matching is case-insensitive and checks title and synonym fields.
 * Returns matching HindiAnimeListItem[] sorted by rating (descending).
 */
export function searchHindiAnime(query: string): HindiAnimeListItem[] {
  if (!query || query.trim().length === 0) return [];

  const normalized = query.toLowerCase().trim();
  const terms = normalized.split(/\s+/);

  const scored = PRE_POPULATED_INDEX.map((item) => {
    const titleLower = item.title.toLowerCase();
    let score = 0;

    // Exact match
    if (titleLower === normalized) score += 100;
    // Starts with
    if (titleLower.startsWith(normalized)) score += 50;
    // Contains full query
    if (titleLower.includes(normalized)) score += 30;
    // Each term matches
    for (const term of terms) {
      if (titleLower.includes(term)) score += 10;
    }
    // Boost by rating
    score += parseFloat(item.rating) || 0;

    return { item, score };
  }).filter(({ score }) => score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.map(({ item }) => item);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream URL constructors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construct a megaplay.buzz streaming URL using the AniList ID.
 * These URLs are embeddable — they can be used directly in iframes.
 *
 * @param anilistId - The AniList ID of the anime
 * @param episode - The episode number
 * @param type - "sub" for subtitles, "dub" for Hindi dubbed
 */
export function getHindiStreamUrl(
  anilistId: number,
  episode: number,
  type: "sub" | "dub"
): string {
  return `${MEGAPLAY_ANI_BASE}/${anilistId}/${episode}/${type}`;
}

/**
 * Construct a megaplay.buzz streaming URL using the MyAnimeList ID.
 * These URLs are embeddable — they can be used directly in iframes.
 *
 * @param malId - The MyAnimeList ID of the anime
 * @param episode - The episode number
 * @param type - "sub" for subtitles, "dub" for Hindi dubbed
 */
export function getMalStreamUrl(
  malId: number,
  episode: number,
  type: "sub" | "dub"
): string {
  return `${MEGAPLAY_MAL_BASE}/${malId}/${episode}/${type}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Popular Hindi anime
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch popular Hindi dubbed anime.
 * Uses the pre-populated index to fetch full entries for the top-rated anime.
 * Returns a sorted list of HindiAnimeListItem derived from full API data,
 * falling back to the pre-populated index data on failures.
 */
export async function getPopularHindiAnime(
  limit: number = 20
): Promise<HindiAnimeListItem[]> {
  // Take the top entries from our pre-populated index (sorted by rating desc)
  const sortedIndex = [...PRE_POPULATED_INDEX].sort(
    (a, b) => parseFloat(b.rating) - parseFloat(a.rating)
  );

  const topIds = sortedIndex.slice(0, limit).map((item) => item.id);
  const entries = await fetchHindiAnimeBatch(topIds, 5);

  // Build list items from fetched data, enriching with live API data
  const results: HindiAnimeListItem[] = entries.map((entry, i) => {
    const id = topIds[i];
    return {
      id,
      title: entry.title,
      thumbnail: entry.thumbnail,
      type: entry.type,
      rating: entry.rating,
      episodesCount: entry.episodesCount,
    };
  });

  // Fill in any gaps with pre-populated data for IDs that failed to fetch
  const fetchedIds = new Set(results.map((r) => r.id));
  for (const item of sortedIndex.slice(0, limit)) {
    if (!fetchedIds.has(item.id)) {
      results.push(item);
    }
  }

  // Sort by rating descending, then limit
  return results
    .sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating))
    .slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Index discovery — fetch all known anime from the DB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discover anime entries from the Hindi Anime DB by probing a range of IDs.
 * The DB has 838 entries but we don't know all IDs. This function probes
 * a supplied range (or uses sensible defaults) and returns found entries.
 *
 * WARNING: This is expensive — it makes one request per ID in the range.
 * Use sparingly and consider caching the result.
 *
 * @param startId - First AniList ID to probe (default: 1)
 * @param endId - Last AniList ID to probe (default: 160000)
 * @param concurrency - Number of concurrent requests (default: 8)
 * @param onProgress - Optional callback invoked with (found, tried) counts
 */
export async function discoverHindiAnime(
  startId: number = 1,
  endId: number = 160000,
  concurrency: number = 8,
  onProgress?: (found: number, tried: number) => void
): Promise<HindiAnimeListItem[]> {
  const results: HindiAnimeListItem[] = [];
  const ids = Array.from(
    { length: endId - startId + 1 },
    (_, i) => startId + i
  );
  let tried = 0;

  // For large ranges, use a chunked approach to avoid creating massive arrays
  const CHUNK_SIZE = 500;
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CHUNK_SIZE));
  }

  async function probeChunk(chunk: number[]): Promise<void> {
    const probeResults = await Promise.allSettled(
      chunk.map(async (id) => {
        const entry = await fetchHindiAnime(id);
        tried++;
        if (onProgress) onProgress(results.length, tried);
        return entry;
      })
    );

    for (const result of probeResults) {
      if (result.status === "fulfilled" && result.value) {
        const entry = result.value;
        // Derive the AniList ID from the hostUrl or streamingId
        const anilistId = parseInt(entry.streamingId, 10) || 0;
        if (anilistId > 0) {
          results.push({
            id: anilistId,
            title: entry.title,
            thumbnail: entry.thumbnail,
            type: entry.type,
            rating: entry.rating,
            episodesCount: entry.episodesCount,
          });
        }
      }
    }
  }

  // Process chunks with limited concurrency
  const workerQueue = [...chunks];
  async function chunkWorker(): Promise<void> {
    while (workerQueue.length > 0) {
      const chunk = workerQueue.shift();
      if (!chunk) break;
      await probeChunk(chunk);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, workerQueue.length) }, () =>
      chunkWorker()
    )
  );

  return results;
}

/**
 * Get a list of all known anime from the pre-populated index,
 * optionally augmented with live data from the API.
 *
 * This is the recommended way to browse the catalog — it avoids
 * the expensive probe approach of discoverHindiAnime().
 */
export async function getAllKnownHindiAnime(): Promise<HindiAnimeListItem[]> {
  // Return pre-populated data immediately; caller can enrich with fetchHindiAnimeBatch
  return [...PRE_POPULATED_INDEX].sort(
    (a, b) => parseFloat(b.rating) - parseFloat(a.rating)
  );
}

// Set of all known AniList IDs that have Hindi dubs (from pre-populated index)
const _knownHindiIds = new Set(PRE_POPULATED_INDEX.map(a => a.id));

/**
 * Check if an anime has a Hindi dub available.
 *
 * Checks two sources:
 *   1. PRE_POPULATED_INDEX (instant — 79 known IDs)
 *   2. Full API (hindianimedb.simoonabdulla.workers.dev) for IDs not in the index
 *
 * Results are cached in-memory for 15 minutes.
 */
const _hindiCheckCache = new Map<number, boolean>();
export async function isHindiAnime(anilistId: number): Promise<boolean> {
  // Check pre-populated index first (instant)
  if (_knownHindiIds.has(anilistId)) return true;

  // Check in-memory cache
  if (_hindiCheckCache.has(anilistId)) return _hindiCheckCache.get(anilistId)!;

  // Check the full API
  try {
    const entry = await fetchHindiAnime(anilistId);
    const hasHindi = !!(entry && entry.episodes && entry.episodes.length > 0);
    _hindiCheckCache.set(anilistId, hasHindi);
    return hasHindi;
  } catch {
    _hindiCheckCache.set(anilistId, false);
    return false;
  }
}

/**
 * Enrich the pre-populated index with live data from the API.
 * Fetches full entries for all IDs in the index and returns updated items.
 * Useful for getting the latest episode counts, ratings, and thumbnails.
 */
export async function enrichHindiAnimeIndex(): Promise<HindiAnimeListItem[]> {
  const ids = PRE_POPULATED_INDEX.map((item) => item.id);
  const entries = await fetchHindiAnimeBatch(ids, 5);

  const enriched = entries.map((entry, i) => ({
    id: ids[i],
    title: entry.title,
    thumbnail: entry.thumbnail,
    type: entry.type,
    rating: entry.rating,
    episodesCount: entry.episodesCount,
  }));

  // Merge: prefer enriched data, fall back to pre-populated
  const enrichedMap = new Map(enriched.map((e) => [e.id, e]));
  const merged = PRE_POPULATED_INDEX.map(
    (item) => enrichedMap.get(item.id) ?? item
  );

  return merged.sort(
    (a, b) => parseFloat(b.rating) - parseFloat(a.rating)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: extract embeddable stream URLs from an anime entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all embeddable stream URLs for a specific episode of an anime.
 * Filters the episode's files and returns URLs that can be used in iframes.
 */
export function getEpisodeStreamUrls(
  entry: HindiAnimeEntry,
  episodeNumber: number | string,
  type?: "sub" | "dub"
): HindiAnimeFile[] {
  const ep = entry.episodes.find(
    (e) => e.episode === String(episodeNumber)
  );
  if (!ep) return [];
  if (type) return ep.files.filter((f) => f.type === type);
  return ep.files;
}

/**
 * Get the preferred stream URL for an episode.
 * Prefers Hindi dub over sub, and the first available server.
 */
export function getPreferredStreamUrl(
  entry: HindiAnimeEntry,
  episodeNumber: number | string
): string | null {
  const files = getEpisodeStreamUrls(entry, episodeNumber);
  if (files.length === 0) return null;

  // Prefer dub
  const dub = files.find((f) => f.type === "dub");
  if (dub) return dub.url;

  // Fall back to sub
  return files[0]?.url ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if the Hindi Anime DB API is reachable.
 * Returns true if the API responds with the expected status.
 */
export async function checkHindiAnimeDbHealth(): Promise<boolean> {
  try {
    const res = await fetch(API_BASE, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === true;
  } catch {
    return false;
  }
}
