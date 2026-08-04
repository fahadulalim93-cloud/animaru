import { NextRequest, NextResponse } from "next/server";
import { tmdbSeasonDetails } from "@/lib/tmdb-api";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tvId = parseInt(searchParams.get("tvId") || "0");
  const season = parseInt(searchParams.get("season") || "1");

  if (!tvId) return NextResponse.json({ error: "TV ID required" }, { status: 400 });

  try {
    const data = await tmdbSeasonDetails(tvId, season);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
