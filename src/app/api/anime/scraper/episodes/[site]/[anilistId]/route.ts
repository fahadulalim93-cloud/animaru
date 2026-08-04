/**
 * GET /api/anime/scraper/episodes/[site]/[anilistId]
 *
 * Returns unified episode list for an anime by AniList ID.
 * Uses AniList for metadata (title, cover, episodes), the streaming site
 * for episode list + variant info.
 *
 * Example: /api/anime/scraper/episodes/miruro/21
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchEpisodes, SITES } from "@/lib/unified-scraper";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ site: string; anilistId: string }> }
) {
  const { site, anilistId } = await params;
  const id = parseInt(anilistId, 10);
  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid anilistId" }, { status: 400 });
  }
  if (!SITES.find((s) => s.site === site)) {
    return NextResponse.json(
      { error: `Unknown site: ${site}`, available: SITES.map((s) => s.site) },
      { status: 404 }
    );
  }

  try {
    const result = await fetchEpisodes(site, id);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch episodes", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
