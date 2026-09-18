import { adminGuard } from "@/lib/admin-auth-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/me — return the currently logged-in admin user */
export async function GET(req: Request) {
  const [user, err] = await adminGuard(req);
  if (err) return err;

  return new Response(
    JSON.stringify({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        active: user.active,
      },
    }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } }
  );
}
