import { pipe, hToStrObj } from "@/lib/kv";
import { isValidAdminToken } from "@/lib/admin-token-server";
import { DIRECTORY_KEY, MOD_STATUS_KEY, ROLES_KEY, applyModerationAction, logModAction, type DirectoryEntry, type ModStatus } from "@/lib/moderation-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
}

/** GET: full member directory merged with current ban/suspend status + role. */
export async function GET(req: Request) {
  const token = req.headers.get("x-admin-token");
  if (!(await isValidAdminToken(token))) return unauthorized();

  const [dirRaw, modRaw, rolesRaw] = await pipe([["HGETALL", DIRECTORY_KEY], ["HGETALL", MOD_STATUS_KEY], ["HGETALL", ROLES_KEY]]);
  const dirObj = hToStrObj(dirRaw);
  const modObj = hToStrObj(modRaw);
  const rolesObj = hToStrObj(rolesRaw);
  const now = Date.now();

  const members = Object.entries(dirObj).map(([username, json]) => {
    let entry: DirectoryEntry;
    try { entry = JSON.parse(json); } catch { entry = { id: username, username, name: username, email: "", createdAt: new Date().toISOString(), lastSeen: 0 }; }

    let mod: ModStatus | null = null;
    const modJson = modObj[username];
    if (modJson) { try { mod = JSON.parse(modJson); } catch { mod = null; } }
    if (mod?.status === "suspended" && mod.until && mod.until <= now) mod = null; // expired

    const { token: _token, ...safeEntry } = entry;
    return {
      ...safeEntry,
      status: mod?.status || "active",
      reason: mod?.reason || null,
      until: mod?.until || null,
      role: rolesObj[username] === "mod" ? "mod" : "member",
    };
  }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return new Response(JSON.stringify({ ok: true, members }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** POST: { username, action: "ban"|"unban"|"suspend"|"unsuspend"|"promote"|"demote", reason?, hours? } */
export async function POST(req: Request) {
  const token = req.headers.get("x-admin-token");
  if (!(await isValidAdminToken(token))) return unauthorized();

  const body = await req.json().catch(() => null) as {
    username?: string; action?: string; reason?: string; hours?: number;
  } | null;
  const username = body?.username?.trim().toLowerCase();
  const action = body?.action;
  if (!username || !action) {
    return new Response(JSON.stringify({ ok: false, error: "Missing username/action" }), { status: 400 });
  }

  if (action === "ban" || action === "unban" || action === "suspend" || action === "unsuspend") {
    await applyModerationAction(username, action, { reason: body?.reason, hours: body?.hours });
    await logModAction("admin", action, username, body?.reason);
  } else if (action === "promote") {
    await pipe([["HSET", ROLES_KEY, username, "mod"]]);
    await logModAction("admin", "promote", username);
  } else if (action === "demote") {
    await pipe([["HDEL", ROLES_KEY, username]]);
    await logModAction("admin", "demote", username);
  } else {
    return new Response(JSON.stringify({ ok: false, error: "Unknown action" }), { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
