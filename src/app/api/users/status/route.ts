import { pipe } from "@/lib/kv";
import { MOD_STATUS_KEY, type ModStatus } from "@/lib/moderation-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Public read: is this username banned or currently suspended? */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const username = (url.searchParams.get("u") || "").trim().toLowerCase();
  if (!username) {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const [raw] = await pipe([["HGET", MOD_STATUS_KEY, username]]);
  if (!raw || typeof raw !== "string") {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  let entry: ModStatus | null = null;
  try { entry = JSON.parse(raw); } catch { entry = null; }
  if (!entry) {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  // Suspension expired — auto-clear so the account is usable again.
  if (entry.status === "suspended" && entry.until && entry.until <= Date.now()) {
    await pipe([["HDEL", MOD_STATUS_KEY, username]]);
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  return new Response(JSON.stringify({
    status: entry.status,
    reason: entry.reason || null,
    until: entry.until || null,
  }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
