import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeRoom, touchRoom, expireInactiveRooms } from "@/lib/w2g";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  try {
    expireInactiveRooms().catch(() => {});
    const room = await db.watchTogetherRoom.findUnique({ where: { code: code.toUpperCase() }, include: { members: true } });
    if (!room || room.closedAt) return NextResponse.json({ error: "Room not found or closed." }, { status: 404 });
    return NextResponse.json({ room: serializeRoom(room) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await request.json().catch(() => ({}));
  const username = body.username;
  if (!username) return NextResponse.json({ error: "Please log in to join the room." }, { status: 401 });
  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  try {
    const room = await db.watchTogetherRoom.findUnique({ where: { code: code.toUpperCase() }, include: { members: true } });
    if (!room || room.closedAt) return NextResponse.json({ error: "Room not found or closed." }, { status: 404 });
    await db.watchTogetherMember.upsert({
      where: { roomId_username: { roomId: room.id, username } },
      create: { roomId: room.id, username, isHost: false, lastSeen: new Date() },
      update: { lastSeen: new Date() },
    });
    await touchRoom(room.id);
    const updated = await db.watchTogetherRoom.findUnique({ where: { id: room.id }, include: { members: true } });
    return NextResponse.json({ room: serializeRoom(updated) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await request.json().catch(() => ({}));
  const username = body.username;
  const action = request.nextUrl.searchParams.get("action") || "leave";
  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  try {
    const room = await db.watchTogetherRoom.findUnique({ where: { code: code.toUpperCase() }, include: { members: true } });
    if (!room || room.closedAt) return NextResponse.json({ error: "Room not found or closed." }, { status: 404 });
    
    if (action === "close") {
      if (room.hostUsername !== username) return NextResponse.json({ error: "Only the host can close the room." }, { status: 403 });
      await db.watchTogetherRoom.update({ where: { id: room.id }, data: { closedAt: new Date() } });
      return NextResponse.json({ ok: true, closed: true });
    }
    
    // Leave
    await db.watchTogetherMember.deleteMany({ where: { roomId: room.id, username } });
    if (room.hostUsername === username) {
      await db.watchTogetherRoom.update({ where: { id: room.id }, data: { closedAt: new Date() } });
      return NextResponse.json({ ok: true, closed: true });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
