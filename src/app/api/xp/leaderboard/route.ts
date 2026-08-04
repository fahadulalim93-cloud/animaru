import { NextResponse } from "next/server";
import { pipe, kvEnabled, hToStrObj } from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/xp/leaderboard
 *
 * SECRET endpoint — returns top-100 users by XP. NOT exposed in the UI yet.
 *
 * Response: { ok: true, entries: [{ userId, username, totalXp, level, lastActive }] }
 */

// ── In-memory leaderboard fallback (dev) ──
interface LeaderboardEntry {
  userId: string;
  username: string;
  totalXp: number;
  lastActive: string;
}
const inMemoryLeaderboard: LeaderboardEntry[] = [];

/** In-memory track handler writes here so the leaderboard has data in dev. */
export function addInMemoryEntry(userId: string, username: string, xp: number) {
  const existing = inMemoryLeaderboard.find((e) => e.userId === userId);
  if (existing) {
    existing.totalXp += xp;
    existing.lastActive = new Date().toISOString();
  } else {
    inMemoryLeaderboard.push({
      userId,
      username,
      totalXp: xp,
      lastActive: new Date().toISOString(),
    });
  }
  // Keep sorted descending
  inMemoryLeaderboard.sort((a, b) => b.totalXp - a.totalXp);
}

export async function GET() {
  try {
    if (!kvEnabled) {
      // Dev fallback — return whatever in-memory data we have
      const entries = inMemoryLeaderboard.slice(0, 100).map((e) => ({
        userId: e.userId,
        username: e.username,
        totalXp: e.totalXp,
        level: Math.floor(e.totalXp / 1000) + 1,
        lastActive: e.lastActive,
      }));
      return NextResponse.json({ ok: true, entries });
    }

    // Fetch top-100 from the sorted set (highest score first)
    // Redis ZREVRANGE returns members in descending score order.
    // We'll use a pipeline to get the member list and then fetch each user's hash.
    const leaderboardSize = await pipe([
      ["ZCARD", "xp_leaderboard"],
    ]);
    const size = Number(leaderboardSize[0]) || 0;

    if (size === 0) {
      return NextResponse.json({ ok: true, entries: [] });
    }

    // Get top 100 members with scores using ZREVRANGE (not directly supported in our KV helper,
    // so we'll read the leaderboard hash approach instead).
    // Since our KV pipe only supports ZADD/ZREMRANGEBYSCORE/ZCARD, we'll
    // iterate by fetching all user hashes via a separate key that tracks leaderboard members.
    //
    // Alternative approach: use a simple hash at `xp_leaderboard_data` that stores
    // a JSON string of the top entries, updated on each track call.
    // But since we already have ZADD working, let's fetch individual user hashes.

    // Fetch all leaderboard member IDs from a tracking key
    // We maintain `xp_leaderboard_members` as a set-like hash for member tracking
    const membersRaw = await pipe([
      ["HGETALL", "xp_leaderboard_members"],
    ]);
    const membersObj = hToStrObj(membersRaw[0]);
    const memberIds = Object.keys(membersObj);

    if (memberIds.length === 0) {
      return NextResponse.json({ ok: true, entries: [] });
    }

    // Fetch each user's XP hash in a single pipeline
    const fetchCmds = memberIds.map((id) => ["HGETALL", `xp:${id}`] as (string | number)[]);
    const userDatas = await pipe(fetchCmds);

    // Build entries
    const entries: {
      userId: string;
      username: string;
      totalXp: number;
      level: number;
      lastActive: string;
    }[] = [];

    for (let i = 0; i < memberIds.length; i++) {
      const data = hToStrObj(userDatas[i]);
      const totalXp = Number(data.total || 0);
      if (totalXp > 0) {
        entries.push({
          userId: memberIds[i],
          username: data.username || "Unknown",
          totalXp,
          level: Math.floor(totalXp / 1000) + 1,
          lastActive: data.lastActive || "",
        });
      }
    }

    // Sort by totalXp descending, limit to 100
    entries.sort((a, b) => b.totalXp - a.totalXp);
    const top100 = entries.slice(0, 100);

    return NextResponse.json({ ok: true, entries: top100 });
  } catch (e: any) {
    console.error("[XP/Leaderboard] Error:", e?.message);
    return NextResponse.json(
      { ok: false, entries: [], error: "Internal server error" },
      { status: 500 },
    );
  }
}
