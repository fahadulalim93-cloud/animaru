import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const history = await db.watchHistory.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return NextResponse.json(history);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { animeId, animeName, thumbnail, episodeNum, episodeTitle, progress, duration } = body;

    if (!animeId || !animeName || episodeNum === undefined) {
      return NextResponse.json({ error: "animeId, animeName, episodeNum required" }, { status: 400 });
    }

    const history = await db.watchHistory.upsert({
      where: { animeId_episodeNum: { animeId, episodeNum } },
      update: { animeName, thumbnail, episodeTitle, progress, duration },
      create: { animeId, animeName, thumbnail, episodeNum, episodeTitle, progress, duration },
    });

    return NextResponse.json(history);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const animeId = searchParams.get("animeId");

    if (animeId) {
      await db.watchHistory.deleteMany({ where: { animeId } });
    } else {
      await db.watchHistory.deleteMany();
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
