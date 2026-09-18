import { NextRequest, NextResponse } from "next/server";
import { searchMangaBoth } from "@/lib/manga-api";
import { rewriteMangaArray } from "@/lib/cdn/manga-rewrite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  try {
    const results = await searchMangaBoth(q);
    return NextResponse.json({ results: rewriteMangaArray(results) });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
