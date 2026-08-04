import { pipe, hToStrObj } from "@/lib/kv";

export const DIRECTORY_KEY = "users:directory";
export const MOD_STATUS_KEY = "users:mod_status";
export const ROLES_KEY = "users:roles";
export const REPORTS_KEY = "mod:reports";
export const WARNS_KEY = "mod:warns";
export const MOD_LOG_KEY = "mod:action_log";

export type DirectoryEntry = {
  id: string;
  username: string;
  name: string;
  email: string;
  createdAt: string;
  lastSeen: number;
  token?: string; // per-device token, used to verify mod actions server-side
};

export type ModStatus = {
  status: "banned" | "suspended";
  reason?: string;
  until?: number; // ms epoch; only for suspended
  at: number;
};

export type Role = "mod";

export type Report = {
  id: string;
  kind: "mod" | "watch"; // "mod" = filed by a moderator; "watch" = filed by any viewer from the watch page's Report button
  byUsername: string; // "guest" if the reporter wasn't signed in
  byName: string;
  message: string;
  meta?: { animeTitle?: string; episodeNum?: number; server?: string; mode?: string; error?: string; url?: string };
  createdAt: number;
  status: "open" | "resolved";
};

/** The earliest-registered account — same "owner" convention used elsewhere
 *  (isAdminUser in auth-local.ts, the OWNER badge in the admin Members tab).
 *  Mods may never act on this account or on other mods. */
export async function getOwnerUsername(): Promise<string | null> {
  const [dirRaw] = await pipe([["HGETALL", DIRECTORY_KEY]]);
  const dir = hToStrObj(dirRaw);
  let earliest: DirectoryEntry | null = null;
  for (const json of Object.values(dir)) {
    try {
      const entry: DirectoryEntry = JSON.parse(json);
      if (!earliest || new Date(entry.createdAt).getTime() < new Date(earliest.createdAt).getTime()) earliest = entry;
    } catch { /* skip malformed entries */ }
  }
  return earliest?.username.toLowerCase() || null;
}

type ModAction = "ban" | "unban" | "suspend" | "unsuspend";

/** Shared ban/suspend mutation, used by both the admin and mod moderation
 *  API routes so the two stay in sync. */
export async function applyModerationAction(username: string, action: ModAction, opts?: { reason?: string; hours?: number }) {
  const u = username.trim().toLowerCase();
  if (action === "ban") {
    const entry: ModStatus = { status: "banned", reason: opts?.reason?.slice(0, 200), at: Date.now() };
    await pipe([["HSET", MOD_STATUS_KEY, u, JSON.stringify(entry)]]);
  } else if (action === "suspend") {
    const hours = Math.max(1, Math.min(24 * 365, Number(opts?.hours) || 24));
    const entry: ModStatus = { status: "suspended", reason: opts?.reason?.slice(0, 200), until: Date.now() + hours * 3600_000, at: Date.now() };
    await pipe([["HSET", MOD_STATUS_KEY, u, JSON.stringify(entry)]]);
  } else {
    await pipe([["HDEL", MOD_STATUS_KEY, u]]);
  }
}

/** Is this username currently a moderator? */
export async function isMod(username: string): Promise<boolean> {
  const [role] = await pipe([["HGET", ROLES_KEY, username.trim().toLowerCase()]]);
  return role === "mod";
}

export type Warn = {
  id: string;
  username: string;
  byUsername: string;
  byName: string;
  reason: string;
  createdAt: number;
};

export type ModLogEntry = {
  id: string;
  actorUsername: string;
  action: "ban" | "unban" | "suspend" | "unsuspend" | "warn" | "promote" | "demote";
  targetUsername: string;
  reason?: string;
  createdAt: number;
};

/** Records every moderation action (by admin or mod) so there's a single
 *  audit trail — powers the Mod Logs tab. */
export async function logModAction(actorUsername: string, action: ModLogEntry["action"], targetUsername: string, reason?: string) {
  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const entry: ModLogEntry = { id, actorUsername: actorUsername.toLowerCase(), action, targetUsername: targetUsername.toLowerCase(), reason, createdAt: Date.now() };
  await pipe([["HSET", MOD_LOG_KEY, id, JSON.stringify(entry)]]);
}
