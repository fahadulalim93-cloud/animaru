import { PrismaClient } from "@prisma/client";
import { adminGuard } from "@/lib/admin-auth-server";
import { ensureUserTables } from "@/lib/admin-migrate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

/**
 * GET /api/admin/visitors — visitor stats for admin panel (today, week, month, all-time)
 *
 * "Views" = unique visitors entering the site. Each (visitorKey, date) row is one
 * unique visitor on that day. For week/month ranges we count DISTINCT visitorKeys
 * across the days (a visitor coming 5 days in a row = 1 unique, not 5).
 */
export async function GET(req: Request) {
  const [admin, err] = await adminGuard(req);
  if (err) return err;

  try {
    // Ensure SiteVisitor table exists (auto-migrate)
    await ensureUserTables();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Calculate date ranges
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStart = weekAgo.toISOString().slice(0, 10);

    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthStart = monthAgo.toISOString().slice(0, 10);

    // ── Today: count rows where date = today (each row = 1 unique visitor) ──
    const todayCount = await prisma.siteVisitor.count({ where: { date: today } });

    // ── Week / Month / All-time: count DISTINCT visitorKeys ──
    // Use groupBy on visitorKey to dedupe visitors across days.
    const [weekGroups, monthGroups, allTimeGroups] = await Promise.all([
      prisma.siteVisitor.groupBy({
        by: ["visitorKey"],
        where: { date: { gte: weekStart } },
        _count: { visitorKey: true },
      }),
      prisma.siteVisitor.groupBy({
        by: ["visitorKey"],
        where: { date: { gte: monthStart } },
        _count: { visitorKey: true },
      }),
      prisma.siteVisitor.groupBy({
        by: ["visitorKey"],
        _count: { visitorKey: true },
      }),
    ]);

    const weekCount = weekGroups.length;
    const monthCount = monthGroups.length;
    const allTimeCount = allTimeGroups.length;

    // ── Daily breakdown for the last 30 days (for chart) ──
    // Each day's count = number of unique visitors that day (rows with date=X)
    const dailyVisitors = await prisma.siteVisitor.groupBy({
      by: ["date"],
      where: { date: { gte: monthStart } },
      _count: { id: true },
      orderBy: { date: "asc" },
    });

    // ── Top pages visited (this week) ──
    const topPages = await prisma.siteVisitor.groupBy({
      by: ["page"],
      where: { page: { not: null }, date: { gte: weekStart } },
      _count: { page: true },
      orderBy: { _count: { page: "desc" } },
      take: 10,
    });

    // ── Logged-in vs anonymous ratio (this week, by distinct visitorKey) ──
    const [loggedInWeekGroups, anonWeekGroups] = await Promise.all([
      prisma.siteVisitor.groupBy({
        by: ["visitorKey"],
        where: { userId: { not: null }, date: { gte: weekStart } },
      }),
      prisma.siteVisitor.groupBy({
        by: ["visitorKey"],
        where: { userId: null, date: { gte: weekStart } },
      }),
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        today: todayCount,
        week: weekCount,
        month: monthCount,
        allTime: allTimeCount,
        daily: dailyVisitors.map((d) => ({
          date: d.date,
          count: d._count.id,
        })),
        topPages: topPages.map((p) => ({
          page: p.page,
          count: p._count.page,
        })),
        loggedInWeek: loggedInWeekGroups.length,
        anonWeek: anonWeekGroups.length,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }
    );
  } catch (err: any) {
    console.error("[admin-visitors] Error:", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
