import { pipe } from "@/lib/kv";
import { DIRECTORY_KEY } from "@/lib/moderation-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lightweight cross-browser user directory. The site's real auth is
 * per-browser localStorage (see auth-local.ts) — this beacon is the only
 * thing that lets the admin panel see registered members across devices,
 * so Members/ban/suspend actually work in production.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    id?: string; username?: string; name?: string; email?: string; createdAt?: string; token?: string;
  } | null;
  const username = body?.username?.trim().toLowerCase();
  if (!username || !body?.id) {
    return new Response(JSON.stringify({ ok: false }), { status: 400 });
  }

  const record = {
    id: body.id,
    username: body.username as string,
    name: (body.name || body.username as string).slice(0, 60),
    email: (body.email || "").slice(0, 120),
    createdAt: body.createdAt || new Date().toISOString(),
    lastSeen: Date.now(),
    token: body.token?.slice(0, 80),
  };

  await pipe([["HSET", DIRECTORY_KEY, username, JSON.stringify(record)]]);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
