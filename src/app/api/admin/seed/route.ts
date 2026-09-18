import { PrismaClient } from "@prisma/client";
import { adminGuard, hashPassword } from "@/lib/admin-auth-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** POST /api/admin/seed — seed the initial owner admin account.
 *  Requires ADMIN_SECRET env var to match the request's ?secret= param.
 *  Only works if no owner exists yet. */
export async function POST(req: Request) {
  // ── Auth gate: require ADMIN_SECRET ──
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return json({ ok: false, error: "ADMIN_SECRET env var not configured" }, 403);
  }

  const url = new URL(req.url);
  const providedSecret = url.searchParams.get("secret") || "";
  if (providedSecret !== adminSecret) {
    return json({ ok: false, error: "Invalid or missing secret parameter" }, 403);
  }

  // ── Also require existing admin session (double-gate) ──
  const [user, guardResp] = await adminGuard(req);
  if (!user && guardResp) {
    // No active admin session — but allow seeding if no owner exists yet
    // (first-time setup scenario)
    const existingOwner = await prisma.adminUser.findFirst({ where: { role: "owner" } });
    if (existingOwner) {
      return json({ ok: false, error: "Owner already exists. Login required to seed additional accounts." }, 401);
    }
  }

  const body = await req.json().catch(() => null) as {
    username?: string; password?: string; displayName?: string;
  } | null;

  const username = body?.username?.trim().toLowerCase();
  const password = body?.password;

  if (!username || !password) {
    return json({ ok: false, error: "Username and password required (no hardcoded defaults)" }, 400);
  }

  if (password.length < 6) return json({ ok: false, error: "Password must be at least 6 characters" }, 400);

  // Check if owner already exists
  const existing = await prisma.adminUser.findFirst({ where: { role: "owner" } });
  if (existing) return json({ ok: false, error: "Owner already exists" }, 409);

  const hash = await hashPassword(password);
  const newUser = await prisma.adminUser.create({
    data: { username, passwordHash: hash, displayName: body?.displayName || "Owner", role: "owner", active: true },
  });

  await prisma.auditLog.create({
    data: { actorId: newUser.id, actorUsername: newUser.username, action: "settings_change", targetType: "settings", details: JSON.stringify({ action: "seed_owner" }) },
  });

  return json({ ok: true, user: { id: newUser.id, username: newUser.username, displayName: newUser.displayName, role: newUser.role } });
}
