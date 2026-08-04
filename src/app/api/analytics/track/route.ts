import { pipe } from "@/lib/kv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function ok(extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: true, ...extra }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const BOT = /bot|crawl|spider|slurp|bing|preview|monitor|headless|lighthouse|pingdom|facebookexternalhit|embedly|curl|wget/i;

function day(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Real analytics beacon — one lightweight GET per page view.
 * Records: total & daily views/sessions, unique visitors (HLL), online set,
 * per-path, per-country (Vercel geo header), per-referrer, per-device.
 * Signups: /api/analytics/track?event=signup
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ua = req.headers.get("user-agent") || "";
  if (BOT.test(ua)) return ok({ skipped: "bot" });

  const d = day();

  if (url.searchParams.get("event") === "signup") {
    await pipe([["INCR", "a:signups:total"], ["INCR", `a:signups:${d}`]]);
    return ok();
  }

  const path = (url.searchParams.get("p") || "unknown").slice(0, 48);
  if (path === "admin") return ok({ skipped: "admin" });

  const vid = (url.searchParams.get("vid") || "anon").slice(0, 48);
  const ref = (url.searchParams.get("r") || "direct").slice(0, 64);
  const newSession = url.searchParams.get("s") === "1";
  const country = (req.headers.get("x-vercel-ip-country") || "").toUpperCase() || "??";
  const device = /ipad|tablet|playbook|silk/i.test(ua) ? "Tablet"
    : /mobile|iphone|ipod|android|blackberry|opera mini|iemobile|phone/i.test(ua) ? "Mobile"
    : "Desktop";
  const now = Date.now();

  const cmds: (string | number)[][] = [
    ["INCR", "a:v:total"],
    ["INCR", `a:v:${d}`],
    ["HINCRBY", "a:paths", path, 1],
    ["HINCRBY", "a:countries", country, 1],
    ["HINCRBY", "a:refs", ref, 1],
    ["HINCRBY", "a:devices", device, 1],
    ["PFADD", "a:uniq", vid],
    ["ZADD", "a:online", now, vid],
  ];
  if (newSession) {
    cmds.push(["INCR", "a:s:total"], ["INCR", `a:s:${d}`]);
  }
  await pipe(cmds);
  return ok();
}
