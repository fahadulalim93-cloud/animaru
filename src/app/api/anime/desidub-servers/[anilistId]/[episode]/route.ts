import { NextRequest, NextResponse } from "next/server";
import desidubData from "@/data/desidub-anime.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/anime/desidub-servers/[anilistId]/[episode]?title=...
 *
 * DesiDubAnime Hindi dub servers (cloud/no-ads + other servers).
 * Returns server entries in the same format as anixtv-servers.
 *
 * The database is auto-updated by scripts/desidub-updater.py.
 */

interface DesiDubEpisode {
  title: string;
  url: string;
  cloud_stream?: string | null;
  servers?: Record<string, string>; // e.g., { "GDrive": "https://...", "Streamtape": "https://..." }
}

interface DesiDubAnime {
  id: number;
  title: string;
  slug: string;
  url: string;
  episodes: DesiDubEpisode[];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const anilistIdNum = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  const title = req.nextUrl.searchParams.get("title") || "";

  if (isNaN(anilistIdNum) || anilistIdNum <= 0 || isNaN(epNum) || epNum < 1) {
    return NextResponse.json({ error: "Invalid anilistId or episode", servers: [], total: 0 }, { status: 400 });
  }

  const animeList = desidubData as DesiDubAnime[];

  // Fuzzy match by title
  const searchWords = title.toLowerCase().trim().split(/\s+/).filter(w => w.length > 2);
  let bestMatch: DesiDubAnime | null = null;
  let bestScore = 0;

  for (const anime of animeList) {
    const animeTitleLower = anime.title.toLowerCase();

    if (animeTitleLower === title.toLowerCase()) {
      bestMatch = anime;
      bestScore = 100;
      break;
    }

    if (animeTitleLower.includes(title.toLowerCase()) || title.toLowerCase().includes(animeTitleLower)) {
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
      { error: "Anime not found in DesiDub database", searched: title, servers: [], total: 0 },
      { status: 200 } // Return 200 with empty so watch page doesn't error
    );
  }

  // Find the episode
  const episodes = bestMatch.episodes;
  if (!episodes || episodes.length === 0) {
    return NextResponse.json(
      { error: "No episodes available", anime: bestMatch.title, servers: [], total: 0 },
      { status: 200 }
    );
  }

  let epIndex = epNum - 1;
  if (epIndex >= episodes.length) epIndex = episodes.length - 1;
  if (epIndex < 0) epIndex = 0;

  const selectedEp = episodes[epIndex];
  const servers: any[] = [];

  // 1. Cloud/No-Ads server (gdmirrorbot.nl) — primary, no ads
  if (selectedEp.cloud_stream) {
    servers.push({
      id: `desidub:cloud:s1:dub`,
      name: "Buggy (Cloud)",
      source: "desidub",
      provider: "cloud",
      type: "dub",
      quality: "1080p",
      streamUrl: `/api/anime/desidub/watch?title=${encodeURIComponent(bestMatch.title)}&episode=${epIndex + 1}`,
      isM3U8: false,
      isMP4: false,
      isEmbed: true,
      noProxy: false,
      useEmbedProxy: true,
      hardsub: false,
      subtitleTracks: [],
      intro: null,
      outro: null,
    });
  }

  // 2. Other servers from the servers map (GDrive, Streamtape, etc.)
  if (selectedEp.servers) {
    for (const [serverName, serverUrl] of Object.entries(selectedEp.servers)) {
      if (serverUrl) {
        servers.push({
          id: `desidub:${serverName.toLowerCase().replace(/\s+/g, '-')}:s1:dub`,
          name: `Buggy (${serverName})`,
          source: "desidub",
          provider: serverName.toLowerCase().replace(/\s+/g, '-'),
          type: "dub",
          quality: "1080p",
          streamUrl: serverUrl,
          isM3U8: false,
          isMP4: false,
          isEmbed: true,
          noProxy: false,
          useEmbedProxy: true,
          hardsub: false,
          subtitleTracks: [],
          intro: null,
          outro: null,
        });
      }
    }
  }

  return NextResponse.json(
    {
      anilistId: anilistIdNum,
      episode: epIndex + 1,
      matchedTitle: bestMatch.title,
      matchScore: bestScore,
      servers,
      total: servers.length,
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
