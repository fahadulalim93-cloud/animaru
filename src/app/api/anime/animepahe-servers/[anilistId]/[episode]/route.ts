/**
 * GET /api/anime/animepahe-servers/[anilistId]/[episode]?title={title}
 *
 * Returns AnimePahe servers with direct m3u8 URLs.
 * Uses FlareSolverr (Docker on VPS port 8191) to bypass Cloudflare.
 *
 * AnimePahe is sub-only (HorribleSubs, Japanese audio).
 * Subtitles are hard-sub (burned into video — no separate track needed).
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAnimePahe } from "@/lib/animepahe-direct";
import { wrapM3u8UrlWithReferer } from "@/lib/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // FlareSolverr needs more time for first CF solve

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
    const result = await resolveAnimePahe(id, epNum, title);
    if (!result || result.servers.length === 0) {
      return NextResponse.json({ servers: [] });
    }

    const servers = result.servers.map((s, i) => ({
      id: `animepahe:sub:${i}`,
      name: s.name,
      source: "animepahe",
      provider: "animepahe",
      type: "sub",
      quality: s.quality,
      streamUrl: wrapM3u8UrlWithReferer(s.m3u8Url, s.referer),
      isM3U8: true,
      isMP4: false,
      isEmbed: false,
      hardsub: true, // AnimePahe = HorribleSubs = hard-sub (subs burned into video)
      subtitleTracks: [], // No separate subtitle track — subs are burned in
      intro: null,
      outro: null,
    }));

    console.log(`[AnimePahe-Servers] AniList ${id} ep ${epNum}: ${servers.length} servers`);
    return NextResponse.json(
      { servers },
      { headers: { "Cache-Control": "public, s-maxage=300, max-age=300, must-revalidate" } },
    );
  } catch (err) {
    console.error("[AnimePahe-Servers] error:", err);
    return NextResponse.json({ servers: [] });
  }
}
