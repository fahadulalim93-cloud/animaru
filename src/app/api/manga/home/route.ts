import { NextResponse } from "next/server";
import { getMangaHome } from "@/lib/manga-api";

export const runtime = "nodejs";
// The manga home feed is identical for every visitor and changes slowly, so it
// is cached at the edge rather than re-scraped per request (it was
// force-dynamic, which meant every single visit paid the full upstream cost).
export const revalidate = 300; // 5 min

export async function GET() {
  try {
    const sections = await getMangaHome();
    return NextResponse.json(
      { sections },
      {
        headers: {
          // Serve stale instantly while refreshing in the background, so a cold
          // upstream never blocks a visitor.
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
        },
      },
    );
  } catch {
    // Don't cache failures — otherwise one upstream blip is pinned for 5 min.
    return NextResponse.json({ sections: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
