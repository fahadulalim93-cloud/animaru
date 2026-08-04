import { NextRequest, NextResponse } from "next/server";
import { fetchAnimo4Catalog, fetchAnimo4Detail, searchAnimo4 } from "@/lib/animo4-direct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/animo4-catalog?force=1
 *
 * Returns the full 4animo.xyz catalog (978+ anime). Cached for 6 hours
 * server-side; pass ?force=1 to bypass cache.
 *
 * Each entry: { id, slug, title, poster, banner }
 * Use /api/anime/animo4-servers/[id]/[episode]?slug=... to resolve streams.
 */
export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get("force") === "1";
  const q = request.nextUrl.searchParams.get("q") || "";
  const detail = request.nextUrl.searchParams.get("detail");

  try {
    // Detail mode: fetch full metadata for one anime
    if (detail && request.nextUrl.searchParams.get("id") && request.nextUrl.searchParams.get("slug")) {
      const id = parseInt(request.nextUrl.searchParams.get("id")!, 10);
      const slug = request.nextUrl.searchParams.get("slug")!;
      const anime = await fetchAnimo4Detail(id, slug);
      if (!anime) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ anime }, {
        headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      });
    }

    // Search mode
    if (q) {
      const results = await searchAnimo4(q);
      return NextResponse.json({ anime: results, total: results.length });
    }

    // Full catalog
    const items = await fetchAnimo4Catalog(force);
    return NextResponse.json({
      anime: items,
      total: items.length,
      source: "4animo.xyz",
    }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e: any) {
    console.error("[Animo4Catalog] Error:", e?.message);
    return NextResponse.json({ anime: [], total: 0, error: e?.message }, { status: 500 });
  }
}
