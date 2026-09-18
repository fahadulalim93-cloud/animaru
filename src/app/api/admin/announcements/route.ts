import { PrismaClient } from "@prisma/client";
import { adminGuard } from "@/lib/admin-auth-server";
import { pipe, hToStrObj } from "@/lib/kv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();
const ANNOUNCEMENTS_KEY = "announcements";

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
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

/** GET /api/admin/announcements */
export async function GET(req: Request) {
  const [user, err] = await adminGuard(req);
  if (err) return err;

  const [raw] = await pipe([["HGETALL", ANNOUNCEMENTS_KEY]]);
  const obj = hToStrObj(raw);
  const now = Date.now();

  const announcements = Object.values(obj)
    .map((json) => { try { return JSON.parse(json) as Announcement; } catch { return null; } })
    .filter((a): a is Announcement => !!a)
    .filter((a) => !a.expiry || a.expiry > now)
    .sort((a, b) => b.createdAt - a.createdAt);

  return json({ ok: true, announcements });
}

/** POST /api/admin/announcements — create or delete */
export async function POST(req: Request) {
  const [user, err] = await adminGuard(req);
  if (err) return err;

  const body = await req.json().catch(() => null) as {
    action?: "create" | "delete";
    title?: string; message?: string; type?: string; expiry?: number | null; id?: string;
  } | null;

  if (!body?.action) return json({ ok: false, error: "Missing action" }, 400);

  if (body.action === "delete") {
    if (!body.id) return json({ ok: false, error: "Missing id" }, 400);
    await pipe([["HDEL", ANNOUNCEMENTS_KEY, body.id]]);
    await prisma.auditLog.create({
      data: { actorId: user.id, actorUsername: user.username, action: "delete_announcement", targetType: "announcement", targetId: body.id },
    });
    return json({ ok: true });
  }

  if (body.action === "create") {
    const title = body.title?.trim();
    const message = body.message?.trim();
    const type = body.type || "info";
    if (!title || !message) return json({ ok: false, error: "Title and message required" }, 400);
    if (!["info", "warning", "update"].includes(type)) return json({ ok: false, error: "Invalid type" }, 400);

    const id = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const announcement: Announcement = {
      id, title: title.slice(0, 120), message: message.slice(0, 2000),
      type: type as "info" | "warning" | "update",
      createdAt: Date.now(), expiry: body.expiry || null, active: true,
    };
    await pipe([["HSET", ANNOUNCEMENTS_KEY, id, JSON.stringify(announcement)]]);
    await prisma.auditLog.create({
      data: { actorId: user.id, actorUsername: user.username, action: "create_announcement", targetType: "announcement", targetId: id, details: JSON.stringify({ title }) },
    });
    return json({ ok: true, announcement });
  }

  return json({ ok: false, error: "Unknown action" }, 400);
}
