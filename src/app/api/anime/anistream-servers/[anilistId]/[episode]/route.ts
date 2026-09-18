/**
 * GET /api/anime/anistream-servers/[anilistId]/[episode]
 *
 * Returns Anistream.one servers (HLS + embeds).
 * Separate endpoint so it doesn't block other providers.
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchAnistreamSources } from "@/lib/anistream-api";

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
    const results = await fetchAnistreamSources(id, epNum, { sub: true, dub: true, timeoutMs: 10000 }).catch(() => []);

    const servers: any[] = [];
    for (const r of results) {
      const provName = r.server.charAt(0).toUpperCase() + r.server.slice(1);
      const typeTag = r.type === "dub" ? " (Dub)" : (r.hardsub ? " (HS)" : "");
      servers.push({
        id: `anistream:${r.server}:${r.type}`,
        name: `${provName}${typeTag}`,
        source: "anistream",
        provider: r.server,
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: r.isEmbed,
        hardsub: r.hardsub,
        subtitleTracks: r.tracks,
        intro: r.intro,
        outro: r.outro,
      });
    }

    console.log(`[Anistream-Servers] AniList ${id} ep ${epNum}: ${servers.length} servers`);
    return NextResponse.json({ servers });
  } catch (err) {
    console.error("[Anistream-Servers] error:", err);
    return NextResponse.json({ servers: [] });
  }
}
