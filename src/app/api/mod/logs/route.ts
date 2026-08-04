import { pipe, hToStrObj } from "@/lib/kv";
import { verifyStaff } from "@/lib/mod-auth-server";
import { MOD_LOG_KEY, type ModLogEntry } from "@/lib/moderation-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: staff-only (admin OR mod) — recent moderation actions, newest first. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!(await verifyStaff(req, url.searchParams.get("u"), url.searchParams.get("token")))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
  }

  const [raw] = await pipe([["HGETALL", MOD_LOG_KEY]]);
  const obj = hToStrObj(raw);
  const logs = Object.values(obj)
    .map((json) => { try { return JSON.parse(json) as ModLogEntry; } catch { return null; } })
    .filter((l): l is ModLogEntry => !!l)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 200);

  return new Response(JSON.stringify({ ok: true, logs }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
