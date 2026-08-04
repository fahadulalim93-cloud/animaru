import { pipe, hToStrObj } from "@/lib/kv";
import { isValidAdminToken } from "@/lib/admin-token-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ANNOUNCEMENTS_KEY = "announcements";

function unauthorized() {
  return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "update";
  createdAt: number;
  expiry: number | null;
  active: boolean;
}

/** GET: admin-only — list all announcements, newest first. */
export async function GET(req: Request) {
  const token = req.headers.get("x-admin-token");
  if (!(await isValidAdminToken(token))) return unauthorized();

  const [raw] = await pipe([["HGETALL", ANNOUNCEMENTS_KEY]]);
  const obj = hToStrObj(raw);

  // Filter out expired announcements
  const now = Date.now();
  const announcements = Object.values(obj)
    .map((json) => { try { return JSON.parse(json) as Announcement; } catch { return null; } })
    .filter((a): a is Announcement => !!a)
    .filter((a) => !a.expiry || a.expiry > now)
    .sort((a, b) => b.createdAt - a.createdAt);

  return new Response(JSON.stringify({ ok: true, announcements }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** POST: admin-only — create a new announcement or delete an existing one.
 *  body: { action: "create", title, message, type, expiry? } | { action: "delete", id } */
export async function POST(req: Request) {
  const token = req.headers.get("x-admin-token");
  if (!(await isValidAdminToken(token))) return unauthorized();

  const body = await req.json().catch(() => null) as {
    action?: "create" | "delete";
    title?: string;
    message?: string;
    type?: string;
    expiry?: number | null;
    id?: string;
  } | null;

  if (!body?.action) {
    return new Response(JSON.stringify({ ok: false, error: "Missing action" }), { status: 400 });
  }

  if (body.action === "delete") {
    if (!body.id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing announcement id" }), { status: 400 });
    }
    await pipe([["HDEL", ANNOUNCEMENTS_KEY, body.id]]);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  if (body.action === "create") {
    const title = body.title?.trim();
    const message = body.message?.trim();
    const type = body.type || "info";

    if (!title || !message) {
      return new Response(JSON.stringify({ ok: false, error: "Title and message required" }), { status: 400 });
    }

    if (!["info", "warning", "update"].includes(type)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid type" }), { status: 400 });
    }

    const id = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const announcement: Announcement = {
      id,
      title: title.slice(0, 120),
      message: message.slice(0, 2000),
      type: type as "info" | "warning" | "update",
      createdAt: Date.now(),
      expiry: body.expiry || null,
      active: true,
    };

    await pipe([["HSET", ANNOUNCEMENTS_KEY, id, JSON.stringify(announcement)]]);
    return new Response(JSON.stringify({ ok: true, announcement }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  return new Response(JSON.stringify({ ok: false, error: "Unknown action" }), { status: 400 });
}
