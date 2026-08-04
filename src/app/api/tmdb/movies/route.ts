import { NextRequest, NextResponse } from "next/server";
import { tmdbPopularMovies, tmdbTopRatedMovies, tmdbNowPlayingMovies, tmdbUpcomingMovies, tmdbDiscoverMovies } from "@/lib/tmdb-api";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || "popular";
  const page = parseInt(searchParams.get("page") || "1");
  const genre = searchParams.get("genre") ? parseInt(searchParams.get("genre")!) : undefined;

  try {
    let data;
    switch (category) {
      case "popular":
        data = await tmdbPopularMovies(page);
        break;
      case "top_rated":
        data = await tmdbTopRatedMovies(page);
        break;
      case "now_playing":
        data = await tmdbNowPlayingMovies(page);
        break;
      case "upcoming":
        data = await tmdbUpcomingMovies(page);
        break;
      case "discover":
        data = await tmdbDiscoverMovies({ genre, sort_by: "popularity.desc", page });
        break;
      default:
        data = await tmdbPopularMovies(page);
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ results: [], total_pages: 0 }, { status: 500 });
  }
}
