/**
 * GET /api/anime/scraper/search?q=...&page=1&perPage=20
 * Searches AniList for anime.
 */
import { NextRequest, NextResponse } from "next/server";
import { searchAnilist } from "@/lib/unified-scraper";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const perPage = parseInt(url.searchParams.get("perPage") || "20", 10);

  if (!q.trim()) {
    return NextResponse.json({ error: "Missing 'q' parameter" }, { status: 400 });
  }

  try {
    const result = await searchAnilist(q, page, perPage);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Search failed", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
