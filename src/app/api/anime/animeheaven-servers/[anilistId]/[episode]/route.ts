/**
 * GET /api/anime/animeheaven-servers/[anilistId]/[episode]
 *
 * Returns AnimeHeaven (animeheaven.me) direct MP4 streams.
 * Separate endpoint so it doesn't block other providers.
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchAnimeHeavenSources } from "@/lib/animeheaven-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> }
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ servers: [] }, { status: 400 });
  }

  try {
    const results = await fetchAnimeHeavenSources(id, epNum, { timeoutMs: 10000 }).catch(() => []);

    const servers: any[] = [];
    for (const r of results) {
      servers.push({
        id: `animeheaven:${r.provider}:sub`,
        name: `Shanks`,
        source: "animeheaven",
        provider: r.provider,
        type: "sub",
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: false,
        hardsub: false,
      });
    }

    console.log(`[AnimeHeaven-Servers] AniList ${id} ep ${epNum}: ${servers.length} servers`);
    return NextResponse.json({ servers });
  } catch (err) {
    console.error("[AnimeHeaven-Servers] error:", err);
    return NextResponse.json({ servers: [] });
  }
}
