import { PrismaClient } from "@prisma/client";
import { requireUser } from "@/lib/user-auth-server";
import { ensureUserTables } from "@/lib/admin-migrate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

/**
 * POST /api/visitors/track
 *
 * Called on every page load to track unique visitors.
 * Uses a hash of IP + User-Agent as the visitor key.
 * Upserts on (visitorKey, date) so each unique visitor is counted once per day.
 */
export async function POST(req: Request) {
  try {
    // Ensure SiteVisitor table exists (auto-migrate)
    await ensureUserTables();

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "";

    // Create a simple hash of IP + UA for visitor fingerprinting
    const raw = `${ip}:${ua}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const chr = raw.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32-bit integer
    }
    const visitorKey = `v_${Math.abs(hash).toString(36)}`;

    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

    // Check if logged in user
    const user = await requireUser(req);
    const userId = user?.id || null;

    // Parse body for page path
    let body: { page?: string } | null = null;
    try { body = await req.json(); } catch {}

    // Upsert: if this visitor already visited today, skip; otherwise create
    await prisma.siteVisitor.upsert({
      where: { visitorKey_date: { visitorKey, date: today } },
      update: {}, // no-op — already counted today
      create: {
        visitorKey,
        date: today,
        userId,
        page: body?.page || null,
        ip: ip.slice(0, 45),
        userAgent: ua.slice(0, 255),
      },
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (err: any) {
    // Don't fail the page load if tracking fails
    console.warn("[visitors-track] Error:", err?.message || String(err));
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
