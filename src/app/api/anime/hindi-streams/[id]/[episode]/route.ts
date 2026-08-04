import { NextRequest, NextResponse } from "next/server";
import { resolveAnimoStreamStreams } from "@/lib/animostream-direct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/hindi-streams/[id]/[episode]?postId=...&season=s1
 *
 * Unified Hindi stream resolver. Routes the request to the correct backend
 * based on the synthetic ID range:
 *
 *   - id < 2_000_000        → legacy Hindi Anime DB (megaplay.buzz) —
 *                             the existing /api/hindi/watch endpoint handles
 *                             this; here we return an empty list so the
 *                             frontend falls back to /api/hindi/watch
 *   - 2_000_000+ (with ?postId=...)  → animostream.com Hindi dub
 *
 * The postId MUST be passed as a query param for animostream entries
 * (Blogger postIds are 18 digits and lose precision when encoded in a
 * JS number).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; episode: string }> }
) {
  const { id, episode } = await params;
  const animeId = parseInt(id, 10);
  const epNum = parseInt(episode, 10);

  if (isNaN(animeId) || isNaN(epNum) || epNum < 1) {
    return NextResponse.json({ error: "Invalid id or episode" }, { status: 400 });
  }

  try {
    const servers: any[] = [];

    // animostream.com range — requires postId query param
    if (animeId >= 2_000_000) {
      const postId = _req.nextUrl.searchParams.get("postId");
      if (!postId) {
        return NextResponse.json({
          error: "Missing postId query param (required for animostream streams)",
          servers: [],
          total: 0,
        }, { status: 400 });
      }
      const season = _req.nextUrl.searchParams.get("season") || "s1";
      const results = await resolveAnimoStreamStreams(postId, epNum, season);

      for (const r of results) {
        servers.push({
          id: `animostream:${postId}:${r.serverName}:${r.episode}`,
          name: `AnimoStream ${r.serverName} (Hindi Dub)`,
          source: "animostream",
          provider: r.serverName.toLowerCase().replace(/\s/g, ""),
          type: "dub",
          quality: r.quality,
          streamUrl: r.streamUrl,
          isM3U8: r.isM3U8,
          isMP4: r.isMP4,
          isEmbed: r.isEmbed,
          priority: 0.9,
          subtitleTracks: r.subtitleTracks,
        });
      }
    }

    return NextResponse.json({
      id: animeId,
      episode: epNum,
      servers,
      total: servers.length,
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch (e: any) {
    console.error(`[HindiStreams] failed for ${animeId} ep${epNum}:`, e?.message);
    return NextResponse.json({ servers: [], total: 0, error: e?.message });
  }
}
