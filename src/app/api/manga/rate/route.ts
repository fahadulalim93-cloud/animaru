import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/manga/rate
 * Body: { mangaId, username, rating }
 *
 * Submit or update a user's rating for a manga (0.0 – 10.0).
 * Uses upsert on [mangaId, username] so each user can rate each manga once.
 * Also creates the parent MangaView row if it doesn't exist (for the
 * foreign key constraint).
 *
 * Returns the updated combined stats:
 *   { ourRating, ourRatingCount, ourViews }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mangaId, username, rating } = body;

    if (!mangaId || !username) {
      return NextResponse.json({ error: "mangaId and username required" }, { status: 400 });
    }

    const numericRating = parseFloat(rating);
    if (isNaN(numericRating) || numericRating < 0 || numericRating > 10) {
      return NextResponse.json({ error: "rating must be 0-10" }, { status: 400 });
    }

    // Ensure the MangaView row exists (for FK constraint)
    await db.mangaView.upsert({
      where: { mangaId },
      create: { mangaId, views: 0 },
      update: {},
    });

    // Upsert the rating (one per user per manga)
    await db.mangaRating.upsert({
      where: { mangaId_username: { mangaId, username } },
      create: { mangaId, username, rating: numericRating },
      update: { rating: numericRating },
    });

    // Compute aggregate stats
    const allRatings = await db.mangaRating.findMany({
      where: { mangaId },
      select: { rating: true },
    });
    const ourRatingCount = allRatings.length;
    const ourRating = ourRatingCount > 0
      ? allRatings.reduce((sum, r) => sum + r.rating, 0) / ourRatingCount
      : 0;

    const viewRow = await db.mangaView.findUnique({
      where: { mangaId },
      select: { views: true },
    });
    const ourViews = viewRow?.views || 0;

    return NextResponse.json({
      mangaId,
      username,
      rating: numericRating,
      ourRating: Math.round(ourRating * 10) / 10,
      ourRatingCount,
      ourViews,
    });
  } catch (err) {
    console.error("[/api/manga/rate] error:", err);
    return NextResponse.json({ error: "Failed to save rating" }, { status: 500 });
  }
}
