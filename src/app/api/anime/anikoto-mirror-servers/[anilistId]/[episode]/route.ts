import { NextRequest, NextResponse } from "next/server";
import { resolveAnikotoMirrorStreams } from "@/lib/anikoto-mirror";
import { wrapStreamUrl } from "@/lib/proxy";
import { getTitle } from "@/lib/anilist-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/anikoto-mirror-servers/[anilistId]/[episode]?title={title}
 *
 * Returns Inazuma streams from anikototv.to mirror.
 *
 * Megaplay URLs are returned RAW (no proxy) with megaplayFileId set —
 * the player calls megaplay.buzz/getSources client-side to get the real
 * m3u8 + subtitles + intro/outro. This bypasses the proxy IP block.
 *
 * Vidtube URLs go through the proxy (same as AniKoto's VidPlay handling).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  let title = req.nextUrl.searchParams.get("title") || "";

  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ servers: [] }, { status: 400 });
  }

  // If title wasn't passed, resolve from AniList cache
  if (!title) {
    try {
      title = (await getTitle(id)) || "";
    } catch {}
  }

  try {
    const result = await Promise.race([
      resolveAnikotoMirrorStreams(id, epNum, title),
      new Promise<null>(r => setTimeout(() => r(null), 25000)),
    ]);

    if (!result || result.length === 0) {
      return NextResponse.json({ servers: [] });
    }

    const servers = result.map((s) => ({
      id: `anikoto-mirror:${s.serverName}:${s.type}:${s.streamUrl.slice(-12)}`,
      name: `${s.serverName} (Mirror)`,
      source: "anikoto-mirror" as const,
      provider: "anikoto-mirror",
      type: s.type,
      quality: s.quality,
      // Megaplay URLs: return RAW (no proxy) — player uses client-side getSources
      // Vidtube URLs: wrap through proxy for Referer header
      streamUrl: s.megaplayFileId ? s.streamUrl : wrapStreamUrl(s.streamUrl),
      isM3U8: s.isM3U8,
      isMP4: false,
      isEmbed: s.isEmbed,
      hardsub: s.hardsub,
      megaplayFileId: s.megaplayFileId,
      megaplayAudio: s.megaplayAudio,
      subtitleTracks: s.subtitleTracks || [],
      intro: s.intro,
      outro: s.outro,
    }));

    return NextResponse.json(
      { servers },
      { headers: { "Cache-Control": "public, s-maxage=300, max-age=300, must-revalidate" } },
    );
  } catch (err) {
    console.error("[AniKoto-Mirror-Servers] error:", err);
    return NextResponse.json({ servers: [] });
  }
}
