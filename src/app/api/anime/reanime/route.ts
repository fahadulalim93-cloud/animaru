/**
 * GET /api/anime/reanime
 *
 * ReAnime.to browse/trending API — standalone endpoint.
 * ReAnime has NO manga section, so this provides anime browse data.
 *
 * Query params:
 *   ?section=latest   → latest aired anime
 *   ?section=upcoming → upcoming anime
 *   ?section=top      → top ranked (period=week)
 *   ?section=search&q=Naruto → search
 *   ?limit=20         → results per page (default 20)
 */
import { NextRequest, NextResponse } from "next/server";
import {
  searchReAnime,
  getReAnimeLatestAired,
  getReAnimeUpcoming,
  getReAnimeTop,
} from "@/lib/reanime-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const section = searchParams.get("section") || "latest";
  const q = searchParams.get("q") || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);

  try {
    let results: any[] = [];
    let title = "ReAnime";

    switch (section) {
      case "search":
        if (!q) {
          return NextResponse.json({ error: "Missing ?q= parameter" }, { status: 400 });
        }
        results = await searchReAnime(q, limit);
        title = `Search: ${q}`;
        break;

      case "latest":
        results = await getReAnimeLatestAired(limit);
        title = "Latest Aired";
        break;

      case "upcoming":
        results = await getReAnimeUpcoming(limit);
        title = "Upcoming Anime";
        break;

      case "top":
        results = await getReAnimeTop("week", limit);
        title = "Top Anime This Week";
        break;

      default:
        return NextResponse.json({ error: `Unknown section: ${section}. Use: latest, upcoming, top, search` }, { status: 400 });
    }

    // Normalize results for the frontend
    const normalized = results.map((item: any) => ({
      id: item.anime_id || item.id || "",
      title: item.title?.english || item.title?.romaji || item.title || "",
      romaji: item.title?.romaji || "",
      native: item.title?.native || "",
      coverImage: item.cover_image?.extra_large || item.cover_image?.large || item.cover_image?.medium || item.poster || "",
      format: item.format || "",
      status: item.status || "",
      genres: item.genres || [],
      season: item.season || "",
      year: item.season_year || item.year || null,
      episodes: item.episodes || 0,
      duration: item.duration || "",
      averageScore: item.average_score || item.averageScore || null,
      popularity: item.popularity || 0,
      subbed: item.subbed || 0,
      dubbed: item.dubbed || 0,
      rating: item.rating || "",
      source: "reanime",
    }));

    return NextResponse.json({
      section,
      title,
      results: normalized,
      total: normalized.length,
    }, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (e: any) {
    console.error(`[ReAnime API] failed:`, e?.message || e);
    return NextResponse.json({
      section,
      results: [],
      total: 0,
      error: e?.message || "Failed to fetch ReAnime data",
    }, { status: 200 });
  }
}
