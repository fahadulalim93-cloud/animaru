import { NextRequest, NextResponse } from "next/server";
import { searchMangaBoth } from "@/lib/manga-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });

  try {
    // Search BOTH providers (mangaball + atsumaru) in parallel
    const results = await searchMangaBoth(q);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
