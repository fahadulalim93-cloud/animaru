import { NextRequest, NextResponse } from "next/server";
import { pipe, kvEnabled } from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/xp/track
 *
 * Secret XP tracking endpoint — stores XP events in Vercel KV for a future
 * leaderboard. NOT exposed in the UI yet.
 *
 * Body: { userId: string, username: string, xp: number, source: string }
 *   source: "episode_watched" | "anime_completed" | "achievement_unlocked" | "daily_login" | etc.
 *
 * Key patterns:
 *   xp:{userId}            — hash with fields: total, username, lastActive
 *   xp_log:{userId}:{ts}   — hash with fields: source, xp, timestamp
 *   xp_leaderboard         — sorted set (score = total XP, member = userId)
 *
 * Response: { ok: true, totalXp: number }
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, username, xp, source } = body as {
      userId?: string;
      username?: string;
      xp?: number;
      source?: string;
    };

    if (!userId || !username || typeof xp !== "number" || !source) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: userId, username, xp, source" },
        { status: 400 },
      );
    }

    if (xp < 0 || xp > 10000) {
      return NextResponse.json(
        { ok: false, error: "XP must be between 0 and 10000" },
        { status: 400 },
      );
    }

    const now = Date.now();
    const ts = now.toString();
    const xpKey = `xp:${userId}`;
    const logKey = `xp_log:${userId}:${ts}`;

    if (!kvEnabled) {
      // Dev fallback — still return a plausible total
      return NextResponse.json({ ok: true, totalXp: xp });
    }

    // Pipeline 1: increment total XP, store metadata, log the event
    const results = await pipe([
      ["HINCRBY", xpKey, "total", xp],
      ["HSET", xpKey, "username", username],
      ["HSET", xpKey, "lastActive", ts],
      ["HSET", logKey, "source", source],
      ["HSET", logKey, "xp", String(xp)],
      ["HSET", logKey, "timestamp", ts],
    ]);

    const totalXp = Number(results[0]) || xp;

    // Pipeline 2: update leaderboard sorted set + member tracking
    await pipe([
      ["ZADD", "xp_leaderboard", totalXp, userId],
      ["HSET", "xp_leaderboard_members", userId, username],
    ]);

    return NextResponse.json({ ok: true, totalXp });
  } catch (e: any) {
    console.error("[XP/Track] Error:", e?.message);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
