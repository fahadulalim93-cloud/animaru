/**
 * GET /api/anime/scraper/meta/[anilistId]
 * Returns AniList metadata for an anime (title, cover, banner, genres, score, etc.)
 */
import { NextRequest, NextResponse } from "next/server";
import { getAnimeMeta } from "@/lib/unified-scraper";

export const dynamic = "force-dynamic";

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
    const meta = await getAnimeMeta(id);
    if (!meta) {
      return NextResponse.json({ error: "Anime not found" }, { status: 404 });
    }
    return NextResponse.json(meta, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch metadata", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
