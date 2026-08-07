import { NextResponse } from "next/server";
import desidubData from "@/data/desidub-anime.json";

/**
 * /api/anime/desidub/watch?title=One+Piece&episode=1
 * 
 * Serves cloud (no-ads) stream URLs from the DesiDubAnime scraper database.
 * The database is auto-updated by scripts/desidub-updater.py on a schedule.
 * 
 * Uses gdmirrorbot.nl (cloud/no-ads server).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.toLowerCase().trim() || "";
  const episode = parseInt(searchParams.get("episode") || "1") || 1;

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
      cloud_stream: string | null;
    }>;
  }>;

  // Fuzzy match: check if title contains search terms or vice versa
  const searchWords = title.split(/\s+/).filter(w => w.length > 2);
  
  let bestMatch = null;
  let bestScore = 0;

  for (const anime of animeList) {
    const animeTitleLower = anime.title.toLowerCase();
    
    // Exact match
    if (animeTitleLower === title) {
      bestMatch = anime;
      bestScore = 100;
      break;
    }
    
    // Contains match
    if (animeTitleLower.includes(title) || title.includes(animeTitleLower)) {
      const score = Math.min(animeTitleLower.length, title.length) / Math.max(animeTitleLower.length, title.length) * 80;
      if (score > bestScore) {
        bestMatch = anime;
        bestScore = score;
      }
      continue;
    }
    
    // Word overlap match
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

  // Try to find the specific episode
  let epIndex = episode - 1; // 0-based
  if (epIndex >= episodes.length) epIndex = episodes.length - 1;
  if (epIndex < 0) epIndex = 0;

  const selectedEp = episodes[epIndex];
  
  if (!selectedEp?.cloud_stream) {
    return NextResponse.json(
      { error: "Cloud stream not available for this episode", anime: bestMatch.title, episode: epIndex + 1 },
      { status: 404 }
    );
  }

  return NextResponse.json({
    source: "desidubanime.me",
    server: "Cloud (No Ads)",
    anime: bestMatch.title,
    episode: epIndex + 1,
    episodeTitle: selectedEp.title,
    streamUrl: selectedEp.cloud_stream,
    streamType: "iframe",
    totalEpisodes: episodes.length,
  }, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    }
  });
}
