import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const animeId = searchParams.get("animeId");
    const episode = searchParams.get("episode");

    if (!animeId) {
      return NextResponse.json({ error: "animeId required" }, { status: 400 });
    }

    // Gracefully handle missing database (Vercel read-only filesystem)
    if (!db) {
      return NextResponse.json({ comments: [], stats: { avgRating: 0, totalRatings: 0 } });
    }

    const where: Record<string, unknown> = { animeId };
    if (episode) where.episode = parseFloat(episode);

    const comments = await db.comment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { userLikes: true },
    });

    // Calculate stats
    const ratings = comments.filter(c => c.rating != null).map(c => c.rating!);
    const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : 0;
    const totalRatings = ratings.length;

    return NextResponse.json({ comments, stats: { avgRating: Math.round(avgRating * 10) / 10, totalRatings } });
  } catch (error: unknown) {
    // Return empty comments instead of 500 error when database is unavailable
    return NextResponse.json({ comments: [], stats: { avgRating: 0, totalRatings: 0 } });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { animeId, episode, username, content, parentId, rating } = body;

    if (!animeId || !username || !content) {
      return NextResponse.json({ error: "animeId, username, content required" }, { status: 400 });
    }

    // Validate rating
    if (rating != null && (rating < 1 || rating > 5)) {
      return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 });
    }

    const comment = await db.comment.create({
      data: { animeId, episode, username, content, parentId, rating: rating || null },
      include: { userLikes: true },
    });
    return NextResponse.json(comment);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create comment";
    return NextResponse.json({ error: "Comments unavailable" }, { status: 200 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Comment id required" }, { status: 400 });
    }

    await db.commentLike.deleteMany({ where: { commentId: id } });
    await db.comment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete comment";
    return NextResponse.json({ error: "Comments unavailable" }, { status: 200 });
  }
}
