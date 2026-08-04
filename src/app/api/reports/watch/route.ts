import { pipe } from "@/lib/kv";
import { REPORTS_KEY, type Report } from "@/lib/moderation-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public: the watch page's "Report" button. Anyone can flag a broken
 * server/stream — no sign-in required — and it lands in the admin panel's
 * Reports tab alongside moderator reports.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    username?: string; message?: string;
    animeTitle?: string; episodeNum?: number; server?: string; mode?: string; error?: string; url?: string;
  } | null;

  const message = body?.message?.trim().slice(0, 1000) || "Reported a playback issue.";

  const id = `report_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const report: Report = {
    id,
    kind: "watch",
    byUsername: (body?.username || "guest").slice(0, 40),
    byName: (body?.username || "Guest viewer").slice(0, 60),
    message,
    meta: {
      animeTitle: body?.animeTitle?.slice(0, 120),
      episodeNum: typeof body?.episodeNum === "number" ? body.episodeNum : undefined,
      server: body?.server?.slice(0, 40),
      mode: body?.mode?.slice(0, 20),
      error: body?.error?.slice(0, 300),
      url: body?.url?.slice(0, 300),
    },
    createdAt: Date.now(),
    status: "open",
  };
  await pipe([["HSET", REPORTS_KEY, id, JSON.stringify(report)]]);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
