import { NextRequest, NextResponse } from "next/server";
import { tmdbSearchMulti, tmdbSearchMovie, tmdbSearchTV } from "@/lib/tmdb-api";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") || "";
  const type = searchParams.get("type") || "multi"; // multi, movie, tv
  const page = parseInt(searchParams.get("page") || "1");

  if (!query) return NextResponse.json({ results: [], total_pages: 0, total_results: 0 });

  try {
    let data;
    switch (type) {
      case "movie":
        data = await tmdbSearchMovie(query, page);
        break;
      case "tv":
        data = await tmdbSearchTV(query, page);
        break;
      default:
        data = await tmdbSearchMulti(query, page);
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ results: [], total_pages: 0, total_results: 0 }, { status: 500 });
  }
}
