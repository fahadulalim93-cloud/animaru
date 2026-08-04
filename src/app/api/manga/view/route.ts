import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/manga/view?mangaId={mangaId}
 *
 * Increments our own view counter for a manga. Called every time a user
 * opens the manga detail page. Uses upsert so the first view creates the
 * row automatically.
 *
 * Returns the updated view count (our own, NOT including atsu.moe's base).
 * The detail page combines this with atsu.moe's base views for display.
 */
export async function POST(request: NextRequest) {
  const mangaId = request.nextUrl.searchParams.get("mangaId");
  if (!mangaId) {
    return NextResponse.json({ error: "mangaId required" }, { status: 400 });
  }

  try {
    // Upsert: create the manga view row if it doesn't exist, then increment
    const updated = await db.mangaView.upsert({
      where: { mangaId },
      create: { mangaId, views: 1 },
      update: { views: { increment: 1 } },
    });

    return NextResponse.json({
      mangaId,
      ourViews: updated.views,
    });
  } catch (err) {
    console.error("[/api/manga/view] error:", err);
    // Return a graceful fallback so the detail page still renders
    return NextResponse.json({ mangaId, ourViews: 0, error: "DB unavailable" }, { status: 200 });
  }
}

/**
 * GET /api/manga/view?mangaId={mangaId}
 *
 * Returns our own view count for a manga (without incrementing).
 */
export async function GET(request: NextRequest) {
  const mangaId = request.nextUrl.searchParams.get("mangaId");
  if (!mangaId) {
    return NextResponse.json({ error: "mangaId required" }, { status: 400 });
  }

  try {
    const row = await db.mangaView.findUnique({
      where: { mangaId },
      select: { views: true },
    });
    return NextResponse.json({ mangaId, ourViews: row?.views || 0 });
  } catch (err) {
    console.error("[/api/manga/view GET] error:", err);
    return NextResponse.json({ mangaId, ourViews: 0 });
  }
}
