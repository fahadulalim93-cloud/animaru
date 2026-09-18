import { PrismaClient } from "@prisma/client";
import { adminGuard } from "@/lib/admin-auth-server";
import { pipe, hToStrObj } from "@/lib/kv";
import { DIRECTORY_KEY, MOD_STATUS_KEY, ROLES_KEY } from "@/lib/moderation-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** GET /api/admin/moderation — full member directory */
export async function GET(req: Request) {
  const [user, err] = await adminGuard(req);
  if (err) return err;

  const [dirRaw, modRaw, rolesRaw] = await pipe([
    ["HGETALL", DIRECTORY_KEY],
    ["HGETALL", MOD_STATUS_KEY],
    ["HGETALL", ROLES_KEY],
  ]);
  const dirObj = hToStrObj(dirRaw);
  const modObj = hToStrObj(modRaw);
  const rolesObj = hToStrObj(rolesRaw);
  const now = Date.now();

  const members = Object.entries(dirObj).map(([username, raw]) => {
    let entry: any;
    try { entry = JSON.parse(raw); } catch { entry = { id: username, username, name: username, email: "", createdAt: new Date().toISOString(), lastSeen: 0 }; }

    let mod: any = null;
    const modJson = modObj[username];
    if (modJson) { try { mod = JSON.parse(modJson); } catch { mod = null; } }
    if (mod?.status === "suspended" && mod.until && mod.until <= now) mod = null;

    return {
      id: entry.id || username,
      username: entry.username || username,
      name: entry.name || username,
      email: entry.email || "",
      createdAt: entry.createdAt,
      lastSeen: entry.lastSeen || 0,
      status: mod?.status || "active",
      reason: mod?.reason || null,
      until: mod?.until || null,
      role: rolesObj[username] === "mod" ? "mod" : "member",
    };
  }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return json({ ok: true, members });
}

/** POST /api/admin/moderation — moderation actions */
export async function POST(req: Request) {
  const [user, err] = await adminGuard(req);
  if (err) return err;

  const body = await req.json().catch(() => null) as {
    username?: string; action?: string; reason?: string; hours?: number;
  } | null;
  const targetUsername = body?.username?.trim().toLowerCase();
  const action = body?.action;

  if (!targetUsername || !action) return json({ ok: false, error: "Missing username/action" }, 400);

  // Apply the action using the existing moderation server logic
  const { applyModerationAction } = await import("@/lib/moderation-server");

  if (action === "ban" || action === "unban" || action === "suspend" || action === "unsuspend") {
    await applyModerationAction(targetUsername, action as any, { reason: body?.reason, hours: body?.hours });
  } else if (action === "promote") {
    await pipe([["HSET", ROLES_KEY, targetUsername, "mod"]]);
  } else if (action === "demote") {
    await pipe([["HDEL", ROLES_KEY, targetUsername]]);
  } else if (action === "warn") {
    // Warn is just a log entry
  } else {
    return json({ ok: false, error: "Unknown action" }, 400);
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      actorUsername: user.username,
      action,
      targetType: "user",
      targetId: targetUsername,
      details: JSON.stringify({ reason: body?.reason, hours: body?.hours }),
    },
  });

  return json({ ok: true });
}
