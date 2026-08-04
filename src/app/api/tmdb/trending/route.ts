import { NextRequest, NextResponse } from "next/server";
import { tmdbTrendingAll, tmdbTrendingMovies, tmdbTrendingTV } from "@/lib/tmdb-api";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "all"; // all, movie, tv
  const time = (searchParams.get("time") || "week") as "day" | "week";
  const page = parseInt(searchParams.get("page") || "1");

  try {
    let data;
    switch (type) {
      case "movie":
        data = await tmdbTrendingMovies(time, page);
        break;
      case "tv":
        data = await tmdbTrendingTV(time, page);
        break;
      default:
        data = await tmdbTrendingAll(time, page);
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ results: [], total_pages: 0 }, { status: 500 });
  }
}
