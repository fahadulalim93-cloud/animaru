import { getTokenFromCookies, deleteSession, sessionCookieClear } from "@/lib/admin-auth-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/admin/logout — clear session */
export async function POST(req: Request) {
  const token = await getTokenFromCookies();
  if (token) await deleteSession(token);

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": sessionCookieClear(),
      "cache-control": "no-store",
    },
  });
}
