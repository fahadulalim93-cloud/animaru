import { db } from "@/lib/db";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export async function generateUniqueRoomCode(maxAttempts = 10): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateRoomCode();
    const existing = await db?.watchTogetherRoom.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique room code");
}

export interface W2GRoomState {
  playing: boolean;
  currentTime: number;
  updatedAt: number;
  episodeNum: number;
  playbackRate?: number;
}

export const initialRoomState = (episodeNum: number): W2GRoomState => ({
  playing: false, currentTime: 0, updatedAt: Date.now(), episodeNum, playbackRate: 1.0,
});

export interface W2GRoomPublic {
  id: string; code: string; visibility: "public" | "private";
  animeId: number; episodeNum: number; animeTitle: string; animeImage: string | null;
  state: W2GRoomState; createdAt: string;
  members: Array<{ id: string; username: string; isHost: boolean; muted: boolean; joinedAt: string; }>;
  memberCount: number;
  host: { username: string };
}

export function serializeRoom(room: any): W2GRoomPublic {
  return {
    id: room.id, code: room.code, visibility: room.visibility as "public" | "private",
    animeId: room.animeId, episodeNum: room.episodeNum, animeTitle: room.animeTitle,
    animeImage: room.animeImage || null, state: room.state as W2GRoomState,
    createdAt: room.createdAt.toISOString(),
    members: (room.members || []).map((m: any) => ({
      id: m.id, username: m.username, isHost: m.isHost, muted: m.muted, joinedAt: m.joinedAt.toISOString(),
    })),
    memberCount: room.members?.length || 0,
    host: { username: room.hostUsername || "unknown" },
  };
}

const ROOM_ACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const ROOM_CLOSED_RETENTION_MS = 24 * 60 * 60 * 1000;

export async function touchRoom(roomId: string): Promise<void> {
  if (!db) return;
  await db.watchTogetherRoom.update({ where: { id: roomId }, data: { lastActivity: new Date() } }).catch(() => {});
}

export async function expireInactiveRooms(): Promise<number> {
  if (!db) return 0;
  const now = new Date();
  const inactivityCutoff = new Date(now.getTime() - ROOM_ACTIVITY_TIMEOUT_MS);
  const retentionCutoff = new Date(now.getTime() - ROOM_CLOSED_RETENTION_MS);
  const closed = await db.watchTogetherRoom.updateMany({ where: { closedAt: null, lastActivity: { lt: inactivityCutoff } }, data: { closedAt: now } });
  const deleted = await db.watchTogetherRoom.deleteMany({ where: { closedAt: { lt: retentionCutoff } } });
  return (closed.count || 0) + (deleted.count || 0);
}

export async function joinRoom(roomId: string, username: string, isHost: boolean = false): Promise<void> {
  if (!db) return;
  await db.watchTogetherMember.upsert({
    where: { roomId_username: { roomId, username } },
    create: { roomId, username, isHost, lastSeen: new Date() },
    update: { lastSeen: new Date() },
  });
}

export async function leaveRoom(roomId: string, username: string): Promise<void> {
  if (!db) return;
  await db.watchTogetherMember.deleteMany({ where: { roomId, username } });
}

export async function setMemberMuted(roomId: string, username: string, muted: boolean): Promise<void> {
  if (!db) return;
  await db.watchTogetherMember.updateMany({ where: { roomId, username }, data: { muted } });
}
