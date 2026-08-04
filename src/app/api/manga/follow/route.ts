import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/manga/follow?mangaId=&username=
 *  Returns follow count + whether the requesting user follows this manga. */
export async function GET(request: NextRequest) {
  const mangaId = request.nextUrl.searchParams.get("mangaId");
  const username = request.nextUrl.searchParams.get("username");
  if (!mangaId) {
    return NextResponse.json({ error: "mangaId required" }, { status: 400 });
  }
  try {
    const [followCount, userFollow] = await Promise.all([
      prisma.mangaFollow.count({ where: { mangaId } }),
      username ? prisma.mangaFollow.findUnique({ where: { mangaId_username: { mangaId, username } } }) : null,
    ]);
    return NextResponse.json({
      follows: followCount,
      isFollowing: !!userFollow,
    });
  } catch {
    return NextResponse.json({ follows: 0, isFollowing: false });
  }
}

/** POST /api/manga/follow  body: { mangaId, username }
 *  Toggles follow status. Returns new follow count + isFollowing. */
export async function POST(request: NextRequest) {
  try {
    const { mangaId, username } = await request.json();
    if (!mangaId || !username) {
      return NextResponse.json({ error: "mangaId and username required" }, { status: 400 });
    }
    const existing = await prisma.mangaFollow.findUnique({
      where: { mangaId_username: { mangaId, username } },
    });
    if (existing) {
      await prisma.mangaFollow.delete({ where: { id: existing.id } });
      const follows = await prisma.mangaFollow.count({ where: { mangaId } });
      return NextResponse.json({ follows, isFollowing: false });
    } else {
      await prisma.mangaFollow.create({ data: { mangaId, username } });
      const follows = await prisma.mangaFollow.count({ where: { mangaId } });
      return NextResponse.json({ follows, isFollowing: true });
    }
  } catch (err) {
    console.error("[manga/follow] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
