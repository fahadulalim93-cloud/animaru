import { PrismaClient } from "@prisma/client";
import { adminGuard } from "@/lib/admin-auth-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

/** GET /api/admin/audit-logs — paginated audit trail */
export async function GET(req: Request) {
  const [user, err] = await adminGuard(req);
  if (err) return err;

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const action = url.searchParams.get("action") || undefined;

  const where = action ? { action } : {};
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { username: true, displayName: true, avatarUrl: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return new Response(
    JSON.stringify({
      ok: true,
      logs: logs.map((l) => ({
        id: l.id,
        actor: l.actor?.displayName || l.actorUsername,
        actorUsername: l.actorUsername,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        details: l.details,
        ip: l.ip,
        createdAt: l.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } }
  );
}
