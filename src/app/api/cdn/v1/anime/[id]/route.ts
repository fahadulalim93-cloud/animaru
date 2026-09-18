import { NextRequest, NextResponse } from "next/server";
import { getAnimeById } from "@/lib/cdn/cdn-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cdn/v1/anime/[id]
 * GET /api/cdn/v1/media/[id]  (alias)
 *
 * Full metadata by AniList ID.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const anilistId = parseInt(id, 10);
  if (isNaN(anilistId) || anilistId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const anime = getAnimeById(anilistId);
  if (!anime) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(anime, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
