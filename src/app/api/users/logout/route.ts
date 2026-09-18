import { deleteUserSession, getTokenFromCookies, sessionCookieClear } from "@/lib/user-auth-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/users/logout — destroy session and clear cookie */
export async function POST(req: Request) {
  try {
    const token = await getTokenFromCookies();
    if (token) {
      await deleteUserSession(token);
    }
  } catch {
    // Ignore errors — always clear cookie
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": sessionCookieClear(),
      "cache-control": "no-store",
    },
  });
}
