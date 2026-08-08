import { NextResponse } from "next/server";
import desidubData from "@/data/desidub-anime.json";

/**
 * /api/anime/desidub/watch?title=One+Piece&episode=1
 * 
 * Serves stream URLs from the DesiDubAnime scraper database.
 * Supports multiple servers: Mirrordub (cloud/no-ads), Streamp2pdub, Abyssdub, VMolydub, CLOUD.
 * The database is auto-updated by scripts/desidub-updater.py on a schedule.
 * 
 * Query params:
 *   title    - anime title (required)
 *   episode  - episode number (default: 1)
 *   server   - server name: "cloud" (default, Mirrordub/gdmirrorbot), "streamtape", "abyss", "vidmoly", "cloud2"
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.toLowerCase().trim() || "";
  const episode = parseInt(searchParams.get("episode") || "1") || 1;
  const serverName = searchParams.get("server") || "cloud";

  if (!title) {
    return NextResponse.json(
      { error: "Missing title parameter. Usage: /api/anime/desidub/watch?title=One+Piece&episode=1" },
      { status: 400 }
    );
  }

  // Search for matching anime by title
  const animeList = desidubData as Array<{
    id: number;
    title: string;
    slug: string;
    url: string;
    episodes: Array<{
      title: string;
      url: string;
      cloud_stream?: string | null;
      servers?: Record<string, string>;
    }>;
  }>;

  // Fuzzy match: check if title contains search terms or vice versa
  const searchWords = title.split(/\s+/).filter(w => w.length > 2);
  
  let bestMatch = null;
  let bestScore = 0;

  for (const anime of animeList) {
    const animeTitleLower = anime.title.toLowerCase();
    
    if (animeTitleLower === title) {
      bestMatch = anime;
      bestScore = 100;
      break;
    }
    
    if (animeTitleLower.includes(title) || title.includes(animeTitleLower)) {
      const score = Math.min(animeTitleLower.length, title.length) / Math.max(animeTitleLower.length, title.length) * 80;
      if (score > bestScore) {
        bestMatch = anime;
        bestScore = score;
      }
      continue;
    }
    
    const animeWords = animeTitleLower.split(/\s+/).filter(w => w.length > 2);
    const overlap = searchWords.filter(w => animeWords.some(aw => aw.includes(w) || w.includes(aw)));
    if (overlap.length >= Math.ceil(searchWords.length * 0.6)) {
      const score = (overlap.length / searchWords.length) * 60;
      if (score > bestScore) {
        bestMatch = anime;
        bestScore = score;
      }
    }
  }

  if (!bestMatch || bestScore < 30) {
    return NextResponse.json(
      { error: "Anime not found in DesiDub database", searched: title },
      { status: 404 }
    );
  }

  // Get the requested episode
  const episodes = bestMatch.episodes;
  if (!episodes || episodes.length === 0) {
    return NextResponse.json(
      { error: "No episodes available", anime: bestMatch.title },
      { status: 404 }
    );
  }

  let epIndex = episode - 1;
  if (epIndex >= episodes.length) epIndex = episodes.length - 1;
  if (epIndex < 0) epIndex = 0;

  const selectedEp = episodes[epIndex];
  
  // Server name mapping: query param → data key
  const serverMap: Record<string, string> = {
    "cloud": "Mirrordub",      // gdmirrorbot.nl (cloud/no-ads) - default
    "streamtape": "Streamp2pdub", // desidubanime.p2pplay.pro
    "abyss": "Abyssdub",       // play.abyssplayer.com
    "vidmoly": "VMolydub",     // vidmoly.org
    "cloud2": "CLOUD",         // cloud.desidubanime.me
  };

  const dataKey = serverMap[serverName] || serverMap["cloud"];
  
  // Try to get URL from servers map first, then fall back to cloud_stream
  let streamUrl: string | null = null;
  if (selectedEp.servers && selectedEp.servers[dataKey]) {
    streamUrl = selectedEp.servers[dataKey];
  } else if (serverName === "cloud" && selectedEp.cloud_stream) {
    streamUrl = selectedEp.cloud_stream;
  }

  // If the requested server isn't available, try fallback to any available server
  if (!streamUrl && selectedEp.servers) {
    const fallbackOrder = ["Mirrordub", "CLOUD", "Abyssdub", "VMolydub", "Streamp2pdub"];
    for (const fallback of fallbackOrder) {
      if (selectedEp.servers[fallback]) {
        streamUrl = selectedEp.servers[fallback];
        break;
      }
    }
  }

  // Last resort: cloud_stream field
  if (!streamUrl && selectedEp.cloud_stream) {
    streamUrl = selectedEp.cloud_stream;
  }

  if (!streamUrl) {
    return NextResponse.json(
      { error: "No stream available for this episode", anime: bestMatch.title, episode: epIndex + 1 },
      { status: 404 }
    );
  }

  // Build available servers list for response
  const availableServers: Record<string, string> = {};
  if (selectedEp.servers) {
    for (const [name, url] of Object.entries(selectedEp.servers)) {
      availableServers[name] = url;
    }
  }

  return NextResponse.json({
    source: "desidubanime.me",
    server: dataKey,
    anime: bestMatch.title,
    episode: epIndex + 1,
    episodeTitle: selectedEp.title,
    streamUrl,
    streamType: "iframe",
    totalEpisodes: episodes.length,
    availableServers: Object.keys(availableServers),
  }, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    }
  });
}
