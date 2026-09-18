import { adminGuard } from "@/lib/admin-auth-server";
import { clearAllCaches, getCacheStats } from "@/lib/anilist-cache";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** GET /api/admin/cache — cache stats */
export async function GET(req: Request) {
  const [user, err] = await adminGuard(req);
  if (err) return err;

  const stats = getCacheStats();
  return json({ ok: true, ...stats });
}

/** POST /api/admin/cache — purge caches. Body: { target: "anilist" | "all" } */
export async function POST(req: Request) {
  const [user, err] = await adminGuard(req);
  if (err) return err;

  const body = await req.json().catch(() => null) as { target?: string } | null;
  const target = body?.target || "all";

  if (target === "anilist" || target === "all") {
    clearAllCaches();
  }

  await prisma.auditLog.create({
    data: { actorId: user.id, actorUsername: user.username, action: "cache_purge", targetType: "cache", targetId: target, details: JSON.stringify({ target }) },
  });

  const stats = getCacheStats();
  return json({ ok: true, purged: target, ...stats });
}
