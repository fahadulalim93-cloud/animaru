import { pipe, hToStrObj } from "@/lib/kv";
import { verifyModToken } from "@/lib/mod-auth-server";
import {
  DIRECTORY_KEY, MOD_STATUS_KEY, ROLES_KEY, applyModerationAction, getOwnerUsername, logModAction,
  type DirectoryEntry, type ModStatus,
} from "@/lib/moderation-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
}

/** GET: member list for the mod panel (no emails — mods get a lighter view
 *  than the full admin Members tab). Auth via ?u=<mod username>&token=<device token>. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const username = url.searchParams.get("u");
  const token = url.searchParams.get("token");
  if (!(await verifyModToken(username, token))) return unauthorized();

  const [dirRaw, modRaw, rolesRaw] = await pipe([["HGETALL", DIRECTORY_KEY], ["HGETALL", MOD_STATUS_KEY], ["HGETALL", ROLES_KEY]]);
  const dirObj = hToStrObj(dirRaw);
  const modObj = hToStrObj(modRaw);
  const rolesObj = hToStrObj(rolesRaw);
  const owner = await getOwnerUsername();
  const now = Date.now();

  const members = Object.entries(dirObj).map(([uname, json]) => {
    let entry: DirectoryEntry;
    try { entry = JSON.parse(json); } catch { entry = { id: uname, username: uname, name: uname, email: "", createdAt: new Date().toISOString(), lastSeen: 0 }; }

    let mod: ModStatus | null = null;
    const modJson = modObj[uname];
    if (modJson) { try { mod = JSON.parse(modJson); } catch { mod = null; } }
    if (mod?.status === "suspended" && mod.until && mod.until <= now) mod = null;

    return {
      username: entry.username,
      name: entry.name,
      createdAt: entry.createdAt,
      lastSeen: entry.lastSeen || 0,
      status: mod?.status || "active",
      until: mod?.until || null,
      isMod: rolesObj[uname] === "mod",
      isOwner: uname === owner,
    };
  }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return new Response(JSON.stringify({ ok: true, members }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** POST: { u, token, targetUsername, action, reason?, hours? } — mods can
 *  ban/suspend/unban/unsuspend regular members only, never other mods or
 *  the site owner. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    u?: string; token?: string; targetUsername?: string; action?: string; reason?: string; hours?: number;
  } | null;
  if (!(await verifyModToken(body?.u || null, body?.token || null))) return unauthorized();

  const target = body?.targetUsername?.trim().toLowerCase();
  const action = body?.action;
  if (!target || !action || !["ban", "unban", "suspend", "unsuspend"].includes(action)) {
    return new Response(JSON.stringify({ ok: false, error: "Missing/invalid target or action" }), { status: 400 });
  }

  const owner = await getOwnerUsername();
  if (target === owner) {
    return new Response(JSON.stringify({ ok: false, error: "Cannot moderate the site owner" }), { status: 403 });
  }
  const [targetRole] = await pipe([["HGET", ROLES_KEY, target]]);
  if (targetRole === "mod") {
    return new Response(JSON.stringify({ ok: false, error: "Cannot moderate another moderator" }), { status: 403 });
  }

  await applyModerationAction(target, action as "ban" | "unban" | "suspend" | "unsuspend", { reason: body?.reason, hours: body?.hours });
  await logModAction(body!.u!.trim().toLowerCase(), action as "ban" | "unban" | "suspend" | "unsuspend", target, body?.reason);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
