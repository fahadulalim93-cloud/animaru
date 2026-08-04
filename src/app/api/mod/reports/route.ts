import { pipe, hToStrObj } from "@/lib/kv";
import { verifyModToken, verifyStaff } from "@/lib/mod-auth-server";
import { REPORTS_KEY, type Report } from "@/lib/moderation-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
}

/** GET: staff-only (admin OR mod) — list all reports, newest first.
 *  Mods pass ?u=&token=; the admin panel passes x-admin-token. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!(await verifyStaff(req, url.searchParams.get("u"), url.searchParams.get("token")))) return unauthorized();

  const [raw] = await pipe([["HGETALL", REPORTS_KEY]]);
  const obj = hToStrObj(raw);
  const reports = Object.values(obj)
    .map((json) => { try { return JSON.parse(json) as Report; } catch { return null; } })
    .filter((r): r is Report => !!r)
    .sort((a, b) => b.createdAt - a.createdAt);

  return new Response(JSON.stringify({ ok: true, reports }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** POST: mod-only — file a report for staff attention. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    u?: string; token?: string; byName?: string; message?: string;
  } | null;
  if (!(await verifyModToken(body?.u || null, body?.token || null))) return unauthorized();

  const message = body?.message?.trim().slice(0, 1000);
  if (!message) return new Response(JSON.stringify({ ok: false, error: "Message required" }), { status: 400 });

  const id = `report_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const report: Report = {
    id,
    kind: "mod",
    byUsername: body!.u!.trim().toLowerCase(),
    byName: (body?.byName || body!.u!).slice(0, 60),
    message,
    createdAt: Date.now(),
    status: "open",
  };
  await pipe([["HSET", REPORTS_KEY, id, JSON.stringify(report)]]);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** PATCH: staff-only (admin OR mod) — resolve/reopen a report. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null) as { id?: string; status?: string; u?: string; token?: string } | null;
  if (!(await verifyStaff(req, body?.u || null, body?.token || null))) return unauthorized();

  if (!body?.id || (body.status !== "open" && body.status !== "resolved")) {
    return new Response(JSON.stringify({ ok: false, error: "Missing id/status" }), { status: 400 });
  }
  const [raw] = await pipe([["HGET", REPORTS_KEY, body.id]]);
  if (!raw || typeof raw !== "string") return new Response(JSON.stringify({ ok: false, error: "Not found" }), { status: 404 });
  let report: Report;
  try { report = JSON.parse(raw); } catch { return new Response(JSON.stringify({ ok: false, error: "Corrupt report" }), { status: 500 }); }
  report.status = body.status as "open" | "resolved";
  await pipe([["HSET", REPORTS_KEY, body.id, JSON.stringify(report)]]);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
