import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/manga/chapter-comments?mangaId=&chapterId=&sort=best&username=
 *  sort: "best" | "newest" | "oldest"
 *  Returns comments for a specific chapter. */
export async function GET(request: NextRequest) {
  const mangaId = request.nextUrl.searchParams.get("mangaId");
  const chapterId = request.nextUrl.searchParams.get("chapterId");
  const sort = request.nextUrl.searchParams.get("sort") || "best";
  const username = request.nextUrl.searchParams.get("username");

  if (!mangaId || !chapterId) {
    return NextResponse.json({ error: "mangaId and chapterId required" }, { status: 400 });
  }

  try {
    const orderBy =
      sort === "newest" ? { createdAt: "desc" as const } :
      sort === "oldest" ? { createdAt: "asc" as const } :
      { likes: "desc" as const }; // "best" = most likes

    const comments = await prisma.mangaChapterComment.findMany({
      where: { mangaId, chapterId },
      orderBy,
      take: 100,
      include: {
        likers: username ? { where: { username } } : false,
      },
    });

    // Get like counts for each comment + whether the requesting user liked it
    const formatted = comments.map(c => ({
      id: c.id,
      username: c.username,
      text: c.text,
      likes: c.likes,
      createdAt: c.createdAt.toISOString(),
      chapterNum: c.chapterNum,
      hasLiked: username ? (c.likers?.length || 0) > 0 : false,
    }));

    return NextResponse.json({ comments: formatted });
  } catch (err) {
    console.error("[manga/chapter-comments] GET error:", err);
    return NextResponse.json({ comments: [] });
  }
}

/** POST /api/manga/chapter-comments  body: { mangaId, chapterId, chapterNum, username, text }
 *  Creates a new comment. Returns the created comment. */
export async function POST(request: NextRequest) {
  try {
    const { mangaId, chapterId, chapterNum, username, text } = await request.json();
    if (!mangaId || !chapterId || !username || !text?.trim()) {
      return NextResponse.json({ error: "mangaId, chapterId, username, text required" }, { status: 400 });
    }
    if (text.length > 1000) {
      return NextResponse.json({ error: "Comment too long (max 1000 chars)" }, { status: 400 });
    }

    const comment = await prisma.mangaChapterComment.create({
      data: {
        mangaId,
        chapterId,
        chapterNum: chapterNum || 0,
        username,
        text: text.trim(),
      },
    });

    return NextResponse.json({
      comment: {
        id: comment.id,
        username: comment.username,
        text: comment.text,
        likes: 0,
        createdAt: comment.createdAt.toISOString(),
        chapterNum: comment.chapterNum,
        hasLiked: false,
      },
    });
  } catch (err) {
    console.error("[manga/chapter-comments] POST error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

/** PATCH /api/manga/chapter-comments  body: { commentId, username }
 *  Toggles like on a comment. Returns new like count + hasLiked. */
export async function PATCH(request: NextRequest) {
  try {
    const { commentId, username } = await request.json();
    if (!commentId || !username) {
      return NextResponse.json({ error: "commentId and username required" }, { status: 400 });
    }

    const existing = await prisma.mangaChapterCommentLike.findUnique({
      where: { commentId_username: { commentId, username } },
    });

    if (existing) {
      await prisma.mangaChapterCommentLike.delete({ where: { id: existing.id } });
      await prisma.mangaChapterComment.update({
        where: { id: commentId },
        data: { likes: { decrement: 1 } },
      });
      const comment = await prisma.mangaChapterComment.findUnique({ where: { id: commentId } });
      return NextResponse.json({ likes: comment?.likes || 0, hasLiked: false });
    } else {
      await prisma.mangaChapterCommentLike.create({ data: { commentId, username } });
      await prisma.mangaChapterComment.update({
        where: { id: commentId },
        data: { likes: { increment: 1 } },
      });
      const comment = await prisma.mangaChapterComment.findUnique({ where: { id: commentId } });
      return NextResponse.json({ likes: comment?.likes || 0, hasLiked: true });
    }
  } catch (err) {
    console.error("[manga/chapter-comments] PATCH error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
