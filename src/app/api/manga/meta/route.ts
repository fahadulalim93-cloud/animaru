import { NextRequest, NextResponse } from "next/server";
import { getMangaMeta } from "@/lib/manga-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** Lightweight metadata-only endpoint — NO chapters, NO cross-provider merge.
 *  Used by the home page to get anilistId + poster without the expensive
 *  full detail call (which triggers parallel chapter merges). */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  try {
    const meta = await getMangaMeta(id);
    if (!meta) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    // A title's id -> anilistId mapping basically never changes, and the home
    // page fires this once per hero candidate on every visit, so cache it hard.
    return NextResponse.json(meta, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
