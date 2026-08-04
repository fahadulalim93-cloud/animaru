import { NextRequest, NextResponse } from "next/server";
import { fetchAnimeggCatalog, searchAnimegg } from "@/lib/animegg-direct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/animegg-catalog?force=1&q=...
 *
 * Returns the animegg.org catalog. Note: animegg.org is Cloudflare-protected
 * and only the homepage + /popular-series are reliably reachable from the
 * server — expect 5-50 anime max (not a full A-Z catalog).
 */
export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get("force") === "1";
  const q = request.nextUrl.searchParams.get("q") || "";

  try {
    if (q) {
      const results = await searchAnimegg(q);
      return NextResponse.json({ anime: results, total: results.length });
    }

    const items = await fetchAnimeggCatalog(force);
    return NextResponse.json({
      anime: items,
      total: items.length,
      source: "animegg.org",
    }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e: any) {
    console.error("[AnimeggCatalog] Error:", e?.message);
    return NextResponse.json({ anime: [], total: 0, error: e?.message }, { status: 500 });
  }
}
