import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/anime/leaderboard
 *
 * Returns a leaderboard of all registered users, sorted by XP (descending).
 * XP is calculated from the user's activity log (stored in localStorage
 * under key "luffytv-store" → activity array).
 *
 * Since activity is per-browser (localStorage), this endpoint:
 *   1. Reads all users from localStorage ("luffytv_users")
 *   2. Reads the activity log from the requesting user's localStorage
 *      (passed via the ?activity= param — the frontend sends the current
 *      user's activity XP since the server can't access other browsers' data)
 *   3. For users without activity data, generates a synthetic XP based on
 *      join date (earlier join = more XP) so the leaderboard isn't empty
 *
 * Response: { leaderboard: [{ rank, id, username, name, avatar, avatarColor,
 *             avatarImage, level, xp, joinedDate }] }
 */
export async function GET(request: NextRequest) {
  try {
    // This runs server-side but reads from the request body/query
    // The frontend sends the current user's XP + all users list
    const currentXP = parseInt(request.nextUrl.searchParams.get("xp") || "0", 10);
    const usersParam = request.nextUrl.searchParams.get("users") || "[]";

    let users: any[] = [];
    try {
      users = JSON.parse(usersParam);
    } catch {
      users = [];
    }

    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json({ leaderboard: [], total: 0 });
    }

    // Build leaderboard entries
    const now = Date.now();
    const entries = users.map((u: any) => {
      const userId = u.id || "";
      const username = u.username || "Unknown";
      const name = u.name || username;
      const joinedAt = new Date(u.createdAt || now).getTime();

      // Calculate XP:
      // - If this is the requesting user, use their real XP
      // - For other users, generate synthetic XP based on join date
      //   (older accounts have more "activity" — simulates engagement)
      let xp = 0;
      if (u._isCurrentUser) {
        xp = currentXP;
      } else {
        // Synthetic XP: days since join × 50 (simulates ~50 XP/day activity)
        const daysSinceJoin = Math.floor((now - joinedAt) / (1000 * 60 * 60 * 24));
        xp = Math.max(0, daysSinceJoin * 50 + (username.charCodeAt(0) || 0) * 10);
      }

      const level = Math.floor(xp / 1000) + 1;

      return {
        id: userId,
        username,
        name,
        avatar: u.avatar,
        avatarColor: u.avatarColor || "#7c3aed",
        avatarImage: u.avatarImage,
        avatarFrame: u.avatarFrame,
        level,
        xp,
        joinedDate: u.createdAt,
      };
    });

    // Sort by XP descending
    entries.sort((a, b) => b.xp - a.xp);

    // Add rank
    const leaderboard = entries.map((e, i) => ({
      rank: i + 1,
      ...e,
    }));

    return NextResponse.json({
      leaderboard,
      total: leaderboard.length,
    });
  } catch (e: any) {
    console.error("[Leaderboard] Error:", e?.message);
    return NextResponse.json({ leaderboard: [], total: 0, error: e?.message }, { status: 500 });
  }
}
