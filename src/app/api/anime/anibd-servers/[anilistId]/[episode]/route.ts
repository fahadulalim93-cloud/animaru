/**
 * GET /api/anime/anibd-servers/[anilistId]/[episode]
 *
 * Returns AniBD (anibd.app) direct m3u8 streams.
 * Separate endpoint so it doesn't block other providers.
 */
import { NextRequest, NextResponse } from "next/server";

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
    const { resolveAnibdStreams } = await import("@/lib/anibd-direct");
    const streams = await Promise.race([
      resolveAnibdStreams(id, epNum),
      new Promise<any[]>(r => setTimeout(() => r([]), 15000)),
    ]).catch(() => []);

    const servers: any[] = [];
    for (const r of streams) {
      servers.push({
        id: `anibd:${r.serverName}:${r.type}`,
        name: `Reiju ${r.serverName}${r.type === "dub" ? " (Dub)" : ""}`,
        source: "anibd",
        provider: r.serverName.toLowerCase().replace(/\s/g, ""),
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: r.isEmbed,
        hardsub: false,
        subtitleTracks: r.subtitleTracks || [],
        intro: r.intro || null,
        outro: r.outro || null,
      });
    }

    console.log(`[AniBD-Servers] AniList ${id} ep ${epNum}: ${servers.length} servers`);
    return NextResponse.json({ servers });
  } catch (err) {
    console.error("[AniBD-Servers] error:", err);
    return NextResponse.json({ servers: [] });
  }
}
