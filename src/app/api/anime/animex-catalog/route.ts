import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * GET /api/anime/animex-catalog?limit=24&offset=0
 *   Proxy for animex.one GraphQL catalog — avoids CORS issues when called from browser.
 *   Returns: { items: [{ id, titleEnglish, titleRomaji, coverImage, episodeCount }], totalCount }
 */
export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "24", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0", 10);

  try {
    const res = await fetch("https://graphql.animex.one/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{catalogAnime(limit:${limit},offset:${offset}){items{id titleEnglish titleRomaji coverImage episodeCount}totalCount}}`,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json({ items: [], totalCount: 0 }, { status: res.status });
    }

    const data = await res.json();
    const items = data?.data?.catalogAnime?.items || [];
    const totalCount = data?.data?.catalogAnime?.totalCount || 0;

    return NextResponse.json({ items, totalCount });
  } catch (e: any) {
    console.error("[AnimexCatalog] Error:", e?.message);
    return NextResponse.json({ items: [], totalCount: 0, error: e?.message }, { status: 500 });
  }
}
