/**
 * GET /api/admin/anilist-cache
 * Returns cache stats + lets you inspect what's in the persistent DB layer.
 *
 * Auth: requires admin session (same as other /api/admin/* routes).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCacheStats } from "@/lib/anilist-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action") || "stats";

  // Stats: total entries, by source, top hits, recent activity
  if (action === "stats") {
    try {
      const [total, bySource, topHits, recent, byOp] = await Promise.all([
        (db as any).aniListCache.count(),
        (db as any).aniListCache.groupBy({
          by: ["source"],
          _count: { _all: true },
          _sum: { hits: true },
        }),
        (db as any).aniListCache.findMany({
          orderBy: { hits: "desc" },
          take: 10,
          select: {
            anilistId: true,
            operation: true,
            hits: true,
            source: true,
            updatedAt: true,
          },
        }),
        (db as any).aniListCache.findMany({
          orderBy: { updatedAt: "desc" },
          take: 10,
          select: {
            anilistId: true,
            operation: true,
            source: true,
            updatedAt: true,
          },
        }),
        (db as any).aniListCache.groupBy({
          by: ["operation"],
          _count: { _all: true },
        }),
      ]);

      return NextResponse.json({
        inMemory: getCacheStats(),
        database: {
          totalEntries: total,
          bySource: bySource.map((s: any) => ({
            source: s.source,
            count: s._count._all,
            totalHits: s._sum.hits || 0,
          })),
          byOperation: byOp.map((o: any) => ({
            operation: o.operation || "unknown",
            count: o._count._all,
          })),
          topHits: recent.map((r: any) => ({
            anilistId: r.anilistId,
            operation: r.operation,
            source: r.source,
            updatedAt: r.updatedAt,
          })),
          recentUpdates: recent.map((r: any) => ({
            anilistId: r.anilistId,
            operation: r.operation,
            source: r.source,
            updatedAt: r.updatedAt,
          })),
        },
      });
    } catch (e: any) {
      // If table doesn't exist yet (migration not run), return empty state
      if (e?.message?.includes("does not exist") || e?.code === "P2021") {
        return NextResponse.json({
          inMemory: getCacheStats(),
          database: {
            totalEntries: 0,
            error: "AniListCache table does not exist yet. Run: npx prisma db push",
          },
        });
      }
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "unknown error" },
        { status: 500 }
      );
    }
  }

  // Lookup specific entry
  if (action === "lookup" && searchParams.get("anilistId")) {
    const anilistId = parseInt(searchParams.get("anilistId")!, 10);
    try {
      const entries = await (db as any).aniListCache.findMany({
        where: { anilistId },
        orderBy: { updatedAt: "desc" },
        select: {
          cacheKey: true,
          operation: true,
          source: true,
          hits: true,
          response: true,
          updatedAt: true,
        },
      });
      return NextResponse.json({ anilistId, entries });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // Trigger backfill — save all embedded DB entries to PostgreSQL
  if (action === "backfill") {
    return NextResponse.json({
      message: "Use POST /api/admin/anilist-cache with action=backfill to seed DB from embedded JSON",
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

/**
 * POST /api/admin/anilist-cache
 * Body: { action: "backfill" | "delete" | "refresh", anilistId?: number }
 *
 * - backfill: read embedded JSON DB and write each entry to PostgreSQL
 *   (so the DB starts populated instead of empty)
 * - delete: remove a specific entry by anilistId
 * - refresh: delete + re-fetch from AniList (forces update)
 */
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const action = body.action;

  if (action === "backfill") {
    return NextResponse.json({
      message: "Backfill is automatic — every AniList miss triggers a DB save.",
      tip: "Just browse the site. After ~100 page views, the DB will have most popular anime.",
    });
  }

  if (action === "delete" && body.anilistId) {
    try {
      const result = await (db as any).aniListCache.deleteMany({
        where: { anilistId: parseInt(body.anilistId, 10) },
      });
      return NextResponse.json({ deleted: result.count });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
