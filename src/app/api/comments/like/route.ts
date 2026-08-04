import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { commentId, username } = await request.json();

    if (!commentId || !username) {
      return NextResponse.json({ error: "commentId and username required" }, { status: 400 });
    }

    // Check if already liked
    const existing = await db.commentLike.findUnique({
      where: { commentId_username: { commentId, username } },
    });

    if (existing) {
      // Unlike
      await db.commentLike.delete({ where: { id: existing.id } });
      await db.comment.update({
        where: { id: commentId },
        data: { likes: { decrement: 1 } },
      });
      return NextResponse.json({ liked: false });
    } else {
      // Like
      await db.commentLike.create({ data: { commentId, username } });
      await db.comment.update({
        where: { id: commentId },
        data: { likes: { increment: 1 } },
      });
      return NextResponse.json({ liked: true });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to toggle like";
    return NextResponse.json({ error: "Like unavailable" }, { status: 200 });
  }
}
