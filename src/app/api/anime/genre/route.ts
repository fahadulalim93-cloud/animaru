import { NextRequest, NextResponse } from "next/server";
import { getGenreAnime } from "@/lib/anime-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const genre = request.nextUrl.searchParams.get("genre") || "Action";
  const page = parseInt(request.nextUrl.searchParams.get("page") || "1");

  try {
    const results = await getGenreAnime(genre, page);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
