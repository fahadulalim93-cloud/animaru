/**
 * GET /api/anime/anikoto-servers/[anilistId]/[episode]?title={title}
 *
 * Returns AniKoto (anikototv.to / megaplay.buzz) servers with direct m3u8 URLs,
 * subtitle tracks, and skip times. AniKoto replaced AniKoto (site renamed).
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAniKoto } from "@/lib/anikoto-direct";
import { wrapM3u8Url, wrapM3u8UrlWithReferer } from "@/lib/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  const title = req.nextUrl.searchParams.get("title") || "";

  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ servers: [] }, { status: 400 });
  }

  try {
    const result = await resolveAniKoto(id, epNum, title);
    if (!result || !result.servers.length) {
      return NextResponse.json({ servers: [] });
    }

    const servers = result.servers.map((s, i) => {
      const streamUrl = s.m3u8Url
        ? wrapM3u8UrlWithReferer(s.m3u8Url, s.referer)
        : s.embedUrl;
      return {
        id: `anikoto:${s.type}:${i}`,
        name: s.name,
        source: "anikoto",
        provider: "anikoto",
        type: s.type,
        quality: s.quality || "1080p",
        streamUrl,
        isM3U8: !!s.m3u8Url,
        isMP4: false,
        isEmbed: !s.m3u8Url,
        hardsub: false,
        subtitleTracks: s.subtitleTracks || [],
        intro: s.intro || result.intro || null,
        outro: s.outro || result.outro || null,
      };
    });

    console.log(`[AniKoto] AniList ${id} ep ${epNum}: ${servers.length} servers`);
    return NextResponse.json({ servers });
  } catch (err) {
    console.error("[AniKoto] error:", err);
    return NextResponse.json({ servers: [] });
  }
}
