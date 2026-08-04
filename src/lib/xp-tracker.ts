/**
 * XP Tracker — client-side fire-and-forget function.
 *
 * Sends XP events to /api/xp/track with keepalive:true so they survive
 * page navigations and tab closes. Never blocks UI — errors are swallowed.
 */

import type { User } from "@/components/anime/store";

/**
 * Track an XP event on the server. Fire-and-forget — no return value,
 * errors are silently ignored.
 *
 * @param userId   — user.id from the store
 * @param username — user.username from the store
 * @param xp       — amount of XP to award
 * @param source   — what triggered the XP ("episode_watched", etc.)
 */
export function trackXP(
  userId: string,
  username: string,
  xp: number,
  source: string,
): void {
  if (!userId || !username || typeof xp !== "number" || !source) return;
  if (xp < 0) return;

  try {
    fetch("/api/xp/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      cache: "no-store",
      body: JSON.stringify({ userId, username, xp, source }),
    }).catch(() => {}); // swallow errors
  } catch {
    // swallow errors (e.g. fetch not available)
  }
}

/** Convenience: track XP using the User object from the store. */
export function trackXPForUser(
  user: User | null,
  xp: number,
  source: string,
): void {
  if (!user) return;
  trackXP(user.id, user.username, xp, source);
}
