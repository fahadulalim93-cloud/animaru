/**
 * senshi.to Direct Scraper
 *
 * API chain:
 *   1. Search: POST /anime/filter {searchTerm} → anime list with IDs
 *   2. Episodes: GET /episodes/{anime_id} → episode list
 *   3. Embeds: GET /episode-embeds/{anime_id}/{ep_num} → {remote_source_id}
 *   4. Stream: GET https://s.vidcloud.se/_v1/sources?id={remote_source_id} → m3u8 + subtitles
 *
 * Routing: AniList ID → AniList title → search senshi.to by title → match
 * Same approach as AniKoto (title-based matching).
 */

const SENSHI_BASE = "https://senshi.to";
const VIDCLOUD_BASE = "https://s.vidcloud.se";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "application/json, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: SENSHI_BASE + "/",
  Referer: SENSHI_BASE + "/",
};

async function fetchJSON<T = any>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...HEADERS, ...(options?.headers || {}) },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function postJSON<T = any>(url: string, body: any): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Normalize title for matching ──
function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Search senshi.to by title ──
interface SenshiAnime {
  id: number;
  title: string;
  title_english?: string;
  ani_episodes?: string;
  ani_status?: string;
  type?: string;
  ani_year?: string;
}

async function searchSenshi(title: string): Promise<SenshiAnime | null> {
  const data = await postJSON<{ data?: SenshiAnime[] }>(`${SENSHI_BASE}/anime/filter`, {
    searchTerm: title,
    page: 1,
  });
  const results = data?.data || [];
  if (results.length === 0) return null;

  // Find best match by title
  const titleNorm = normalize(title);
  let bestMatch: SenshiAnime | null = null;
  let bestScore = 0;

  for (const a of results) {
    const aTitle = normalize(a.title_english || a.title || "");
    if (aTitle === titleNorm) return a; // exact match

    const titleWords = titleNorm.split(" ").filter(w => w.length > 2);
    const aWords = aTitle.split(" ").filter(w => w.length > 2);
    let score = 0;
    for (const tw of titleWords) {
      if (aWords.some(aw => aw === tw || aw.includes(tw) || tw.includes(aw))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = a;
    }
  }

  return bestMatch;
}

// ── Get episodes ──
interface SenshiEpisode {
  id: number;
  ep_id: number;
  ep_title: string;
  ep_filler: boolean;
  ep_thumbnail?: string;
  intro_start?: number | null;
  intro_end?: number | null;
  outro_start?: number | null;
  outro_end?: number | null;
}

async function getEpisodes(animeId: number): Promise<SenshiEpisode[]> {
  const data = await fetchJSON<SenshiEpisode[]>(`${SENSHI_BASE}/episodes/${animeId}`);
  return Array.isArray(data) ? data : [];
}

// ── Get embeds for an episode ──
interface SenshiEmbed {
  id: number;
  public_id: string;
  remote_source_id: number;
  url: string;
  status: string;
  intro_start_ms?: number | null;
  intro_end_ms?: number | null;
  outro_start_ms?: number | null;
  outro_end_ms?: number | null;
}

async function getEmbeds(animeId: number, epNum: number): Promise<SenshiEmbed[]> {
  const data = await fetchJSON<SenshiEmbed[]>(`${SENSHI_BASE}/episode-embeds/${animeId}/${epNum}`);
  return Array.isArray(data) ? data : [];
}

// ── Get m3u8 from vidcloud ──
interface VidcloudSource {
  source: {
    src: string;
    quality: string;
    audio: string;
  };
  tracks: Array<{
    url: string;
    vtt_url?: string;
    label: string;
  }>;
  font?: string[];
}

async function getVidcloudSources(remoteSourceId: number): Promise<VidcloudSource[] | null> {
  const data = await fetchJSON<VidcloudSource[]>(`${VIDCLOUD_BASE}/_v1/sources?id=${remoteSourceId}`, {
    headers: { Origin: SENSHI_BASE, Referer: SENSHI_BASE + "/" },
  });
  return Array.isArray(data) ? data : null;
}

// ── Types for the response ──
export interface SenshiServer {
  name: string;
  m3u8Url: string;
  type: "sub" | "dub";
  quality: string;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

export interface SenshiResult {
  servers: SenshiServer[];
}

// ── Main: resolve m3u8 for AniList ID + episode ──
export async function resolveSenshi(
  anilistId: number,
  episodeNum: number,
  anilistTitle?: string,
): Promise<SenshiResult | null> {
  try {
    // Step 0: Get title from AniList if not provided
    let title = anilistTitle || "";
    if (!title) {
      try {
        const { cachedQuery } = await import("./anilist-cache");
        const data = await cachedQuery<{ Media: { title: { english?: string; romaji?: string } } } | null>(
          `query ($id: Int) { Media(id: $id, type: ANIME) { title { english romaji } } }`,
          { id: anilistId },
          { ttl: 24 * 60 * 60 * 1000, timeoutMs: 5000 },
        );
        if (data?.Media) {
          title = data.Media.title?.english || data.Media.title?.romaji || "";
        }
      } catch {}
    }

    if (!title) {
      console.warn(`[senshi] No title for AniList ${anilistId}`);
      return null;
    }

    console.log(`[senshi] Searching for: "${title}"`);

    // Step 1: Search senshi.to
    const anime = await searchSenshi(title);
    if (!anime) {
      console.warn(`[senshi] No match for "${title}"`);
      return null;
    }
    console.log(`[senshi] Matched: ${anime.id} - ${anime.title}`);

    // Step 2: Get episodes
    const episodes = await getEpisodes(anime.id);
    if (episodes.length === 0) {
      console.warn(`[senshi] No episodes for ${anime.id}`);
      return null;
    }
    console.log(`[senshi] Found ${episodes.length} episodes`);

    // Find target episode
    const targetEp = episodes.find(e => e.ep_id === episodeNum) || episodes[0];
    const epNum = targetEp.ep_id;

    // Step 3: Get embeds
    const embeds = await getEmbeds(anime.id, epNum);
    if (embeds.length === 0) {
      console.warn(`[senshi] No embeds for ep ${epNum}`);
      return null;
    }

    // Step 4: Get m3u8 from vidcloud for each embed
    const servers: SenshiServer[] = [];

    for (const embed of embeds) {
      const sources = await getVidcloudSources(embed.remote_source_id);
      if (!sources) continue;

      for (const src of sources) {
        const m3u8Url = src.source?.src;
        if (!m3u8Url) continue;

        const type: "sub" | "dub" = src.source.audio === "dub" ? "dub" : "sub";
        const quality = src.source.quality || "1080p";

        // Build subtitle tracks
        const subtitleTracks: Array<{ url: string; lang: string; label: string }> = [];
        for (const track of (src.tracks || [])) {
          if (track.vtt_url) {
            const lang = track.label?.toLowerCase().includes("eng") ? "en" :
                         track.label?.toLowerCase().includes("fre") ? "fr" :
                         track.label?.toLowerCase().includes("ger") ? "de" :
                         track.label?.toLowerCase().includes("spa") ? "es" :
                         track.label?.toLowerCase().includes("por") ? "pt" :
                         "en";
            subtitleTracks.push({
              url: track.vtt_url,
              lang,
              label: track.label || "English",
            });
          }
        }

        // Skip times (from embed)
        const intro = (embed.intro_start_ms != null && embed.intro_end_ms != null)
          ? { start: embed.intro_start_ms / 1000, end: embed.intro_end_ms / 1000 }
          : null;
        const outro = (embed.outro_start_ms != null && embed.outro_end_ms != null)
          ? { start: embed.outro_start_ms / 1000, end: embed.outro_end_ms / 1000 }
          : null;

        // Deduplicate by m3u8 URL
        if (servers.find(s => s.m3u8Url === m3u8Url)) continue;

        servers.push({
          name: `Deo ${embed.status === "HardSub" ? "Hardsub" : "1"} ${type === "dub" ? "(Dub)" : ""}`.trim(),
          m3u8Url,
          type,
          quality,
          subtitleTracks,
          intro,
          outro,
        });
      }
    }

    if (servers.length === 0) {
      console.warn(`[senshi] No m3u8 URLs found`);
      return null;
    }

    console.log(`[senshi] AniList ${anilistId} ep${episodeNum}: ${servers.length} servers`);
    return { servers };
  } catch (err) {
    console.error(`[senshi] Error:`, err);
    return null;
  }
}
