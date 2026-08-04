import { NextRequest, NextResponse } from "next/server";
import { tmdbPopularTV, tmdbTopRatedTV, tmdbOnTheAirTV, tmdbDiscoverTV } from "@/lib/tmdb-api";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || "popular";
  const page = parseInt(searchParams.get("page") || "1");
  const genre = searchParams.get("genre") ? parseInt(searchParams.get("genre")!) : undefined;

  try {
    let data;
    switch (category) {
      case "popular":
        data = await tmdbPopularTV(page);
        break;
      case "top_rated":
        data = await tmdbTopRatedTV(page);
        break;
      case "on_the_air":
        data = await tmdbOnTheAirTV(page);
        break;
      case "discover":
        data = await tmdbDiscoverTV({ genre, sort_by: "popularity.desc", page });
        break;
      default:
        data = await tmdbPopularTV(page);
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ results: [], total_pages: 0 }, { status: 500 });
  }
}
