import { pipe, hToStrObj } from "@/lib/kv";
import { verifyModToken, verifyStaff } from "@/lib/mod-auth-server";
import { WARNS_KEY, ROLES_KEY, getOwnerUsername, logModAction, type Warn } from "@/lib/moderation-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
}

/** GET: staff-only (admin OR mod) — list all warns, newest first. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!(await verifyStaff(req, url.searchParams.get("u"), url.searchParams.get("token")))) return unauthorized();

  const [raw] = await pipe([["HGETALL", WARNS_KEY]]);
  const obj = hToStrObj(raw);
  const warns = Object.values(obj)
    .map((json) => { try { return JSON.parse(json) as Warn; } catch { return null; } })
    .filter((w): w is Warn => !!w)
    .sort((a, b) => b.createdAt - a.createdAt);

  return new Response(JSON.stringify({ ok: true, warns }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** POST: mod-only — { u, token, targetUsername, reason } — issue a warning. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    u?: string; token?: string; targetUsername?: string; reason?: string;
  } | null;
  if (!(await verifyModToken(body?.u || null, body?.token || null))) return unauthorized();

  const target = body?.targetUsername?.trim().toLowerCase();
  const reason = body?.reason?.trim().slice(0, 300);
  if (!target || !reason) {
    return new Response(JSON.stringify({ ok: false, error: "Target and reason required" }), { status: 400 });
  }

  const owner = await getOwnerUsername();
  if (target === owner) return new Response(JSON.stringify({ ok: false, error: "Cannot warn the site owner" }), { status: 403 });
  const [targetRole] = await pipe([["HGET", ROLES_KEY, target]]);
  if (targetRole === "mod") return new Response(JSON.stringify({ ok: false, error: "Cannot warn another moderator" }), { status: 403 });

  const actor = body!.u!.trim().toLowerCase();
  const id = `warn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const warn: Warn = { id, username: target, byUsername: actor, byName: actor, reason, createdAt: Date.now() };
  await pipe([["HSET", WARNS_KEY, id, JSON.stringify(warn)]]);
  await logModAction(actor, "warn", target, reason);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
