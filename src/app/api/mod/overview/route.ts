import { pipe } from "@/lib/kv";
import { verifyStaff } from "@/lib/mod-auth-server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: staff-only (admin OR mod) — the handful of Overview-tab metrics that
 *  aren't already in the member directory: real comment/bookmark counts
 *  (Prisma, when a DB is configured — 0 otherwise) plus site-wide views and
 *  the live online count (KV, same source as the admin analytics dashboard). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!(await verifyStaff(req, url.searchParams.get("u"), url.searchParams.get("token")))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
  }

  const now = Date.now();
  await pipe([["ZREMRANGEBYSCORE", "a:online", 0, now - 5 * 60 * 1000]]);
  const [totalViewsRaw, onlineRaw] = await pipe([["GET", "a:v:total"], ["ZCARD", "a:online"]]);

  let totalComments = 0;
  let totalCollections = 0;
  try {
    if (db) {
      [totalComments, totalCollections] = await Promise.all([db.comment.count(), db.bookmark.count()]);
    }
  } catch { /* DB unavailable — leave at 0 */ }

  return new Response(JSON.stringify({
    ok: true,
    totalComments,
    totalCollections,
    totalViews: Number(totalViewsRaw || 0),
    onlineNow: Number(onlineRaw || 0),
  }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
