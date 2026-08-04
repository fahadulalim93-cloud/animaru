import { NextResponse } from "next/server";
import { tmdbMovieGenres, tmdbTVGenres } from "@/lib/tmdb-api";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "movie";

  try {
    const genres = type === "tv" ? await tmdbTVGenres() : await tmdbMovieGenres();
    return NextResponse.json({ genres });
  } catch {
    return NextResponse.json({ genres: [] }, { status: 500 });
  }
}
