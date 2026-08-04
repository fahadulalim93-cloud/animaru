/**
 * GET /api/anime/miruro-direct/episodes/[anilistId]
 *
 * Scrapes www.miruro.tv/api/secure/pipe DIRECTLY for the episode list.
 * No dependency on any deployed API — this hits miruro.tv itself.
 *
 * Returns normalized episodes with sub/dub variants.
 */
import { NextRequest, NextResponse } from "next/server";
import { getEpisodes } from "@/lib/miruro-direct";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anilistId: string }> }
) {
  const { anilistId } = await params;
  const id = parseInt(anilistId, 10);
  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid anilistId" }, { status: 400 });
  }

  try {
    const result = await getEpisodes(id);
    return NextResponse.json({
      anilistId: id,
      sub: result.sub,
      dub: result.dub,
      providers: result.providers,
      defaultProvider: result.defaultProvider,
      totalEpisodes: Math.max(result.sub.length, result.dub.length),
    }, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch episodes from Miruro", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
