import { PrismaClient } from "@prisma/client";
import { adminGuard } from "@/lib/admin-auth-server";
import { ensureAdminTables, ensureUserTables } from "@/lib/admin-migrate";
import { pipe, hToObj, kvEnabled } from "@/lib/kv";
import { getCacheStats } from "@/lib/anilist-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();
const num = (x: unknown) => Number(x || 0);

/** Safe Prisma query wrapper — returns fallback on error (e.g. table doesn't exist yet). */
async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn("[overview] Prisma query failed (tables may not exist yet):", e instanceof Error ? e.message : String(e));
    return fallback;
  }
}

/** GET /api/admin/overview — dashboard overview stats */
export async function GET(req: Request) {
  const [user, err] = await adminGuard(req);
  if (err) return err;

  // Auto-migrate: ensure all DB tables exist (fixes fresh DB)
  try { await ensureAdminTables(); } catch (e) {
    console.warn("[overview] Auto-migrate warning:", e instanceof Error ? e.message : String(e));
  }
  try { await ensureUserTables(); } catch (e) {
    console.warn("[overview] User-table migrate warning:", e instanceof Error ? e.message : String(e));
  }

  const now = Date.now();

  // ── Real registered user count (from User table) ──
  let realTotalUsers = 0;
  let realNewThisWeek = 0;
  let realNewThisMonth = 0;
  try {
    realTotalUsers = await prisma.user.count();
    realNewThisWeek = await prisma.user.count({
      where: { createdAt: { gte: new Date(now - 7 * 86400000) } },
    });
    realNewThisMonth = await prisma.user.count({
      where: { createdAt: { gte: new Date(now - 30 * 86400000) } },
    });
  } catch (e) {
    console.warn("[overview] User table query failed:", e instanceof Error ? e.message : String(e));
  }

  // ── Visitor stats (today/week/month) ──
  let viewsToday = 0, viewsWeek = 0, viewsMonth = 0, viewsAllTime = 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
    const monthStart = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    viewsToday = await prisma.siteVisitor.count({ where: { date: today } });
    const [wg, mg, ag] = await Promise.all([
      prisma.siteVisitor.groupBy({ by: ["visitorKey"], where: { date: { gte: weekStart } } }),
      prisma.siteVisitor.groupBy({ by: ["visitorKey"], where: { date: { gte: monthStart } } }),
      prisma.siteVisitor.groupBy({ by: ["visitorKey"] }),
    ]);
    viewsWeek = wg.length;
    viewsMonth = mg.length;
    viewsAllTime = ag.length;
  } catch (e) {
    console.warn("[overview] Visitor query failed:", e instanceof Error ? e.message : String(e));
  }

  // ── User stats (from KV directory) ──
  const [dirRaw, modRaw, rolesRaw] = await pipe([
    ["HGETALL", "users:directory"],
    ["HGETALL", "users:mod_status"],
    ["HGETALL", "users:roles"],
  ]);
  const dirObj = (dirRaw && typeof dirRaw === "object") ? dirRaw : {};
  const modObj = (modRaw && typeof modRaw === "object") ? modRaw : {};
  const rolesObj = (rolesRaw && typeof rolesRaw === "object") ? rolesRaw : {};

  let totalUsers = 0;
  let bannedUsers = 0;
  let adminUsers = 0;
  const oneWeekAgo = now - 7 * 86400000;
  const oneMonthAgo = now - 30 * 86400000;
  let newThisWeek = 0;
  let newThisMonth = 0;

  for (const json of Object.values(dirObj as Record<string, string>)) {
    try {
      const entry = JSON.parse(json);
      totalUsers++;
      if (entry.createdAt) {
        const created = new Date(entry.createdAt).getTime();
        if (created >= oneWeekAgo) newThisWeek++;
        if (created >= oneMonthAgo) newThisMonth++;
      }
    } catch {}
  }

  for (const json of Object.values(modObj as Record<string, string>)) {
    try {
      const entry = JSON.parse(json);
      if (entry.status === "banned") bannedUsers++;
    } catch {}
  }

  for (const role of Object.values(rolesObj as Record<string, string>)) {
    if (role === "mod") adminUsers++;
  }

  // Count admin users from AdminUser table too (safe: returns 0 if table missing)
  const adminCount = await safeQuery(() => prisma.adminUser.count({ where: { active: true } }), 0);
  adminUsers += adminCount;

  // ── Online users ──
  await pipe([["ZREMRANGEBYSCORE", "a:online", 0, now - 5 * 60 * 1000]]);
  const [onlineCount] = await pipe([["ZCARD", "a:online"]]);

  // ── Content stats (safe: returns 0 if tables missing) ──
  const totalComments = await safeQuery(() => prisma.comment.count(), 0);
  const pendingReview = 0; // Could add a review system later
  const totalViews = num((await pipe([["GET", "a:v:total"]]))[0]);
  const totalCollections = await safeQuery(() => prisma.bookmark.count(), 0);

  // ── AniList cache stats ──
  const cacheStats = getCacheStats();

  // ── Recent audit logs (safe: returns [] if table missing) ──
  const recentLogs = await safeQuery(
    () => prisma.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { username: true, displayName: true, avatarUrl: true } } },
    }),
    [] as any[]
  );

  return new Response(
    JSON.stringify({
      ok: true,
      users: {
        total: Math.max(totalUsers, realTotalUsers),
        active: num(onlineCount),
        newThisWeek: Math.max(newThisWeek, realNewThisWeek),
        newThisMonth: Math.max(newThisMonth, realNewThisMonth),
        admins: adminUsers,
        banned: bannedUsers,
      },
      views: {
        today: viewsToday,
        week: viewsWeek,
        month: viewsMonth,
        allTime: viewsAllTime,
      },
      content: {
        totalComments,
        pendingReview,
        totalViews,
        collections: totalCollections,
      },
      cache: cacheStats,
      recentLogs: recentLogs.map((l: any) => ({
        id: l.id,
        actor: l.actor?.displayName || l.actorUsername,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        details: l.details,
        createdAt: l.createdAt?.toISOString?.() ?? new Date().toISOString(),
      })),
    }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } }
  );
}
