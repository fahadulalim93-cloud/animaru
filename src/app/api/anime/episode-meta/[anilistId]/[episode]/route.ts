import { NextRequest, NextResponse } from "next/server";
import { getEpisodeMetadata, getSkipTimes } from "@/lib/episode-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * GET /api/anime/episode-meta/[anilistId]/[episode]
 *
 * Returns episode description (from api.ani.zip/TVDB) + skip times (from AniSkip).
 *
 * Response:
 *   {
 *     description: string | null,   // episode-specific description from TVDB
 *     title: string | null,         // episode title from TVDB
 *     thumbnail: string | null,     // episode thumbnail from TVDB
 *     airDate: string | null,
 *     intro: { start, end } | null, // opening skip times from AniSkip
 *     outro: { start, end } | null, // ending skip times from AniSkip
 *   }
 *
 * These are PERSISTENT across provider switches — the skip times come from
 * AniSkip (community database), not from the stream provider, so they work
 * no matter which server the user selects.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);

  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid anilistId" }, { status: 400 });
  }

  try {
    // Fetch episode metadata + skip times in parallel
    const [metaResponse, skipResponse] = await Promise.all([
      getEpisodeMetadata(id),
      getSkipTimes(id, epNum),
    ]);

    const epMeta = metaResponse.episodes[epNum];

    return NextResponse.json({
      title: epMeta?.title || null,
      description: epMeta?.description || null,
      thumbnail: epMeta?.thumbnail || null,
      airDate: epMeta?.airDate || null,
      intro: skipResponse.intro,
      outro: skipResponse.outro,
    });
  } catch (err) {
    console.error("[episode-meta] error:", err);
    return NextResponse.json({
      title: null,
      description: null,
      thumbnail: null,
      airDate: null,
      intro: null,
      outro: null,
    });
  }
}
