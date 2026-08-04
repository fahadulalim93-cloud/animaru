import { pipe, hToObj, kvEnabled } from "@/lib/kv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY = 86400000;
const num = (x: unknown) => Number(x || 0);

function json(o: unknown) {
  return new Response(JSON.stringify(o), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/** Aggregated real analytics for the admin dashboard. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const range = Math.min(30, Math.max(7, Number(url.searchParams.get("days")) || 14));
  const now = Date.now();
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const span = range * 2; // current + previous window for deltas
  const keys = Array.from({ length: span }, (_, i) => new Date(today.getTime() - (span - 1 - i) * DAY).toISOString().slice(0, 10));

  // prune stale "online" members (older than 5 min) before counting
  await pipe([["ZREMRANGEBYSCORE", "a:online", 0, now - 5 * 60 * 1000]]);

  const res = await pipe([
    ["GET", "a:v:total"],
    ["GET", "a:s:total"],
    ["PFCOUNT", "a:uniq"],
    ["ZCARD", "a:online"],
    ["GET", "a:signups:total"],
    ["HGETALL", "a:paths"],
    ["HGETALL", "a:refs"],
    ["HGETALL", "a:countries"],
    ["HGETALL", "a:devices"],
    ["MGET", ...keys.map((k) => `a:v:${k}`)],
    ["MGET", ...keys.map((k) => `a:s:${k}`)],
    ["MGET", ...keys.map((k) => `a:signups:${k}`)],
  ]);
  const [vtot, stot, uniq, online, sgtot, paths, refs, countries, devices, vday, sday, sgday] = res;

  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  const vArr = arr(vday), sArr = arr(sday), sgArr = arr(sgday);
  const cur = (a: unknown[]) => a.slice(range).reduce((s: number, x) => s + num(x), 0);
  const prev = (a: unknown[]) => a.slice(0, range).reduce((s: number, x) => s + num(x), 0);
  const delta = (c: number, p: number) => (p === 0 ? (c === 0 ? 0 : null) : Math.round(((c - p) / p) * 100));

  const series = keys.slice(range).map((k, i) => ({
    day: new Date(k + "T00:00:00Z").getTime(),
    views: num(vArr[range + i]),
    sessions: num(sArr[range + i]),
  }));

  const rows = (obj: unknown, key: string) =>
    Object.entries(hToObj(obj)).map(([k, v]) => ({ [key]: k, count: v })).sort((a, b) => (b.count as number) - (a.count as number)).slice(0, 8);

  return json({
    kvEnabled,
    range,
    totalViews: num(vtot),
    totalSessions: num(stot),
    uniqueVisitors: num(uniq),
    onlineNow: num(online),
    signupsTotal: num(sgtot),
    views: cur(vArr) as number, viewsDelta: delta(cur(vArr) as number, prev(vArr) as number),
    sessions: cur(sArr) as number, sessionsDelta: delta(cur(sArr) as number, prev(sArr) as number),
    signups: cur(sgArr) as number, signupsDelta: delta(cur(sgArr) as number, prev(sgArr) as number),
    series,
    topPaths: rows(paths, "path"),
    referrers: rows(refs, "source"),
    countries: rows(countries, "code"),
    devices: rows(devices, "name"),
  });
}
