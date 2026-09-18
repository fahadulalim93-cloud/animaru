import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  generateUniqueRoomCode,
  initialRoomState,
  serializeRoom,
  expireInactiveRooms,
} from "@/lib/w2g";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * POST /api/w2g/rooms
 *   Body: {
 *     animeId, episodeNum, animeTitle, animeImage?,
 *     visibility: "public" | "private",
 *     hostUsername: string  ← from localStorage (no auth required)
 *   }
 *   Creates a room. No server-side auth — the client checks auth via localStorage.
 */
export async function POST(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  try {
    const body = await request.json();
    const { animeId, episodeNum, animeTitle, animeImage, visibility, hostUsername } = body;

    if (!animeId || typeof animeId !== "number") return NextResponse.json({ error: "animeId required" }, { status: 400 });
    if (!episodeNum || typeof episodeNum !== "number") return NextResponse.json({ error: "episodeNum required" }, { status: 400 });
    if (!animeTitle) return NextResponse.json({ error: "animeTitle required" }, { status: 400 });
    if (visibility !== "public" && visibility !== "private") return NextResponse.json({ error: "visibility must be public or private" }, { status: 400 });
    if (!hostUsername) return NextResponse.json({ error: "Please log in to make a Watch Together room." }, { status: 401 });

    expireInactiveRooms().catch(() => {});
    const code = await generateUniqueRoomCode();

    const room = await db.watchTogetherRoom.create({
      data: {
        code, visibility, animeId, episodeNum, animeTitle,
        animeImage: animeImage || null,
        hostUsername,
        state: initialRoomState(episodeNum) as any,
        members: { create: { username: hostUsername, isHost: true, lastSeen: new Date() } },
      },
      include: { members: true },
    });

    console.log(`[W2G] room ${code} created by ${hostUsername} (${visibility})`);
    return NextResponse.json({ room: serializeRoom(room) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("[W2G] create failed:", e);
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}

export async function GET() {
  if (!db) return NextResponse.json({ rooms: [] });
  try {
    expireInactiveRooms().catch(() => {});
    const rooms = await db.watchTogetherRoom.findMany({
      where: { visibility: "public", closedAt: null },
      include: { members: true },
      orderBy: { lastActivity: "desc" }, take: 50,
    });
    return NextResponse.json({ rooms: rooms.map(serializeRoom) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ rooms: [] });
  }
}
