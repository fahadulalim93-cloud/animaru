import { pipe } from "@/lib/kv";
import { DIRECTORY_KEY, ROLES_KEY, type DirectoryEntry } from "@/lib/moderation-server";
import { isValidAdminToken } from "@/lib/admin-token-server";

/** Verifies a mod action request: the caller must be signed in as `username`
 *  (proven by the per-device token that was beaconed on their last sign-in),
 *  and that username must currently hold the "mod" role. Mirrors the admin
 *  token check in admin-token-server.ts but scoped to one user's own token
 *  rather than a single shared secret. */
export async function verifyModToken(username: string | null, token: string | null): Promise<boolean> {
  if (!username || !token) return false;
  const u = username.trim().toLowerCase();
  const [dirRaw, role] = await pipe([["HGET", DIRECTORY_KEY, u], ["HGET", ROLES_KEY, u]]);
  if (role !== "mod") return false;
  if (!dirRaw || typeof dirRaw !== "string") return false;
  let entry: DirectoryEntry;
  try { entry = JSON.parse(dirRaw); } catch { return false; }
  return !!entry.token && entry.token === token;
}

/** Staff auth for read/shared endpoints (Reports, Warns, Mod Logs): accepts
 *  EITHER a verified mod (u/token) OR the admin token header — both the
 *  admin panel and the mod panel read these same lists. */
export async function verifyStaff(req: Request, username: string | null, token: string | null): Promise<boolean> {
  const adminToken = req.headers.get("x-admin-token");
  if (adminToken && (await isValidAdminToken(adminToken))) return true;
  return verifyModToken(username, token);
}
