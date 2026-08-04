import { NextRequest, NextResponse } from "next/server";
import { fetchAnimoStreamCatalog, fetchAnimoStreamDetail, searchAnimoStream } from "@/lib/animostream-direct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/animostream-catalog?force=1&q=...&detail=1&postId=...
 *
 * Returns the full animostream.com catalog (240+ Hindi-dubbed anime).
 * Cached for 6 hours server-side; pass ?force=1 to bypass cache.
 *
 * Modes:
 *   - default: full catalog (basic info only — title, poster, categories)
 *   - ?q=naruto: search by title
 *   - ?detail=1&postId=...: fetch full metadata + seasons + episode list
 */
export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get("force") === "1";
  const q = request.nextUrl.searchParams.get("q") || "";
  const detail = request.nextUrl.searchParams.get("detail");
  const postId = request.nextUrl.searchParams.get("postId");

  try {
    // Detail mode
    if (detail === "1" && postId) {
      const anime = await fetchAnimoStreamDetail(postId);
      if (!anime) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ anime }, {
        headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      });
    }

    // Search mode
    if (q) {
      const results = await searchAnimoStream(q);
      return NextResponse.json({ anime: results, total: results.length });
    }

    // Full catalog
    const items = await fetchAnimoStreamCatalog(force);
    return NextResponse.json({
      anime: items,
      total: items.length,
      source: "animostream.com",
    }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e: any) {
    console.error("[AnimoStreamCatalog] Error:", e?.message);
    return NextResponse.json({ anime: [], total: 0, error: e?.message }, { status: 500 });
  }
}
