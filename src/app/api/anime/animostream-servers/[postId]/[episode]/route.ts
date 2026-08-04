import { NextRequest, NextResponse } from "next/server";
import { resolveAnimoStreamStreams } from "@/lib/animostream-direct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/animostream-servers/[postId]/[episode]?season=s1
 *
 * Returns Hindi-dub stream URLs for one episode of an anime on animostream.com.
 *
 * Path params:
 *   - postId: Blogger post ID (numeric) OR the full post URL
 *   - episode: 1-based episode number
 *
 * Query params:
 *   - season: "s1" | "s2" | ... (default "s1")
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string; episode: string }> }
) {
  const { postId, episode } = await params;
  const epNum = parseInt(episode, 10);
  const season = _req.nextUrl.searchParams.get("season") || "s1";

  if (!postId) {
    return NextResponse.json({ error: "Missing postId" }, { status: 400 });
  }
  if (isNaN(epNum) || epNum < 1) {
    return NextResponse.json({ error: "Invalid episode" }, { status: 400 });
  }

  try {
    const results = await resolveAnimoStreamStreams(postId, epNum, season);

    const servers = results.map((r, idx) => {
      const urlKey = `${r.serverName}:${idx}`;
      return {
        id: `animostream:${postId}:${urlKey}`,
        name: `AnimoStream ${r.serverName} (Hindi Dub)`,
        source: "animostream" as const,
        provider: r.serverName.toLowerCase().replace(/\s/g, ""),
        type: "dub" as const,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: r.isEmbed,
        priority: 0.8, // Hindi dub — high priority for Hindi users
        subtitleTracks: r.subtitleTracks,
        intro: null,
        outro: null,
      };
    });

    console.log(`[AnimoStream-Servers] ${postId} ep${epNum}: ${servers.length} servers`);

    return NextResponse.json({
      postId,
      episode: epNum,
      season,
      servers,
      total: servers.length,
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch (e: any) {
    console.error(`[AnimoStream-Servers] failed for ${postId} ep${epNum}:`, e?.message || e);
    return NextResponse.json({
      servers: [],
      total: 0,
      error: e?.message || "Failed",
    });
  }
}
