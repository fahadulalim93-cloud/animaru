import { NextRequest, NextResponse } from "next/server";
import { resolveAniWavesStreams } from "@/lib/aniwaves/api";
import { getTitle } from "@/lib/anilist-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> }
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  let title = req.nextUrl.searchParams.get("title") || "";

  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ servers: [] }, { status: 400 });
  }

  // Resolve title from AniList cache if not provided
  if (!title) {
    try {
      title = (await getTitle(id)) || "";
    } catch {}
  }

  try {
    const servers = await resolveAniWavesStreams(id, epNum, title);
    console.log(`[AniWaves-Servers] ${id} ep${epNum}: ${servers.length} servers`);
    return NextResponse.json({
      anilistId: id,
      episode: epNum,
      servers,
      total: servers.length,
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (e: any) {
    console.error(`[AniWaves-Servers] failed for ${id} ep${epNum}:`, e?.message || e);
    return NextResponse.json({ servers: [], total: 0 });
  }
}
