/**
 * POST /api/analytics/watch-beacon
 *
 * Called every 30s from the watch page while the video is playing.
 * Stores the viewer's current watching state in KV with a 60s TTL.
 *
 * Body: { animeTitle, episodeNum, animeId }
 *
 * The KV key is: "watch:online:{visitorKey}" where visitorKey is
 * derived from IP + User-Agent hash (same as the visitor tracking).
 *
 * For logged-in users, their username is stored instead of "Guest".
 */
import { pipe, hToStrObj } from "@/lib/kv";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONLINE_KEY = "watch:online";
const TTL_SECONDS = 60; // 60s — if no beacon in 60s, user is offline

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as {
      animeTitle?: string;
      episodeNum?: number;
      animeId?: string;
    } | null;

    if (!body?.animeTitle) {
      return NextResponse.json({ ok: false, error: "animeTitle required" }, { status: 400 });
    }

    // Get visitor key from IP + UA
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "";
    const hash = Array.from(ip + ua).reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0);
    const visitorKey = `v_${Math.abs(hash).toString(36)}`;

    // Try to get username from auth cookie
    let username = "Guest";
    try {
      const authCookie = req.cookies.get("ltv_auth")?.value || req.cookies.get("token")?.value;
      if (authCookie) {
        const decoded = JSON.parse(atob(authCookie.split(".")[1] || "{}"));
        if (decoded?.username) username = decoded.username;
      }
    } catch {}

    const entry = {
      username,
      visitorKey,
      animeTitle: body.animeTitle,
      episodeNum: body.episodeNum || 1,
      animeId: body.animeId || "",
      lastSeen: Date.now(),
    };

    // Store in KV hash with TTL
    await pipe([
      ["HSET", ONLINE_KEY, visitorKey, JSON.stringify(entry)],
      ["EXPIRE", ONLINE_KEY, TTL_SECONDS],
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[watch-beacon] error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

/**
 * GET /api/analytics/watch-beacon
 *
 * Returns a list of all users currently watching anime (beaconed in last 60s).
 * Used by the admin panel "Live" page.
 */
export async function GET() {
  try {
    // Get all online watchers from KV hash
    const result = await pipe([["HGETALL", ONLINE_KEY]]);
    const raw = hToStrObj(result?.[0]);
    if (!raw) {
      return NextResponse.json({ watchers: [], count: 0 });
    }

    const watchers: Array<{
      username: string;
      animeTitle: string;
      episodeNum: number;
      animeId: string;
      lastSeen: number;
      ago: string;
    }> = [];

    const now = Date.now();
    for (const [key, value] of Object.entries(raw)) {
      try {
        const entry = JSON.parse(value as string);
        const elapsed = Math.floor((now - entry.lastSeen) / 1000);
        const ago = elapsed < 60 ? `${elapsed}s ago` : `${Math.floor(elapsed / 60)}m ago`;

        // Only include entries seen in the last 90s (60s TTL + 30s buffer)
        if (elapsed < 90) {
          watchers.push({
            username: entry.username || "Guest",
            animeTitle: entry.animeTitle || "Unknown",
            episodeNum: entry.episodeNum || 1,
            animeId: entry.animeId || "",
            lastSeen: entry.lastSeen,
            ago,
          });
        }
      } catch {}
    }

    // Sort by most recent first
    watchers.sort((a, b) => b.lastSeen - a.lastSeen);

    return NextResponse.json({ watchers, count: watchers.length });
  } catch (err) {
    console.error("[analytics/online] error:", err);
    return NextResponse.json({ watchers: [], count: 0 });
  }
}
