import { NextRequest, NextResponse } from "next/server";
import { tmdbMovieDetails, tmdbTVDetails } from "@/lib/tmdb-api";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") || "0");
  const type = searchParams.get("type") || "movie"; // movie or tv

  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  try {
    const data = type === "tv"
      ? await tmdbTVDetails(id)
      : await tmdbMovieDetails(id);

    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
