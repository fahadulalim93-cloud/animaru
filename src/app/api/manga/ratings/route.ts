import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manga/ratings?mangaId={mangaId}&username={username}
 *
 * Returns our own view + rating stats for a manga, plus the current user's
 * rating if they've submitted one.
 *
 * Response:
 *   {
 *     mangaId,
 *     ourViews: number,         // our own view count (starts at 0)
 *     ourRating: number,        // average of our users' ratings (0-10)
 *     ourRatingCount: number,   // how many of our users rated it
 *     userRating: number | null // the requesting user's rating (if any)
 *   }
 *
 * The detail page combines these with atsu.moe's base stats:
 *   combinedViews = atsuViews + ourViews
 *   combinedRating = weighted average of atsuRating and ourRating
 */
export async function GET(request: NextRequest) {
  const mangaId = request.nextUrl.searchParams.get("mangaId");
  const username = request.nextUrl.searchParams.get("username");

  if (!mangaId) {
    return NextResponse.json({ error: "mangaId required" }, { status: 400 });
  }

  try {
    // Get our view count
    const viewRow = await db.mangaView.findUnique({
      where: { mangaId },
      select: {
        views: true,
        ratings: { select: { rating: true, username: true } },
      },
    });

    const ourViews = viewRow?.views || 0;
    const allRatings = viewRow?.ratings || [];
    const ourRatingCount = allRatings.length;
    const ourRating = ourRatingCount > 0
      ? allRatings.reduce((sum, r) => sum + r.rating, 0) / ourRatingCount
      : 0;

    // Get the requesting user's rating (if provided)
    let userRating: number | null = null;
    if (username) {
      const userRow = allRatings.find(r => r.username === username);
      if (userRow) userRating = userRow.rating;
    }

    return NextResponse.json({
      mangaId,
      ourViews,
      ourRating: Math.round(ourRating * 10) / 10,
      ourRatingCount,
      userRating,
    });
  } catch (err) {
    console.error("[/api/manga/ratings GET] error:", err);
    return NextResponse.json({
      mangaId,
      ourViews: 0,
      ourRating: 0,
      ourRatingCount: 0,
      userRating: null,
    });
  }
}
