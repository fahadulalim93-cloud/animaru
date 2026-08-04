import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const bookmarks = await db.bookmark.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(bookmarks);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch bookmarks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { animeId, animeName, thumbnail, score, type, status } = body;

    if (!animeId || !animeName) {
      return NextResponse.json({ error: "animeId and animeName required" }, { status: 400 });
    }

    const bookmark = await db.bookmark.upsert({
      where: { animeId },
      update: { animeName, thumbnail, score, type, status },
      create: { animeId, animeName, thumbnail, score, type, status },
    });

    return NextResponse.json(bookmark);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create bookmark";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const animeId = searchParams.get("animeId");

    if (!animeId) {
      return NextResponse.json({ error: "animeId required" }, { status: 400 });
    }

    await db.bookmark.delete({ where: { animeId } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete bookmark";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
