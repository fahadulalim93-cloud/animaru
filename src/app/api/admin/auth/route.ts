import { pipe } from "@/lib/kv";
import { TOKEN_KEY } from "@/lib/admin-token-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Bootstraps/verifies the shared admin token used to authorize moderation
 * mutations from the /admin panel across devices (same demo-grade djb2 hash
 * scheme as the rest of the app's client-only auth — see admin-auth.ts).
 * First caller to POST a token "claims" it; later calls must match.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { token?: string } | null;
  const token = body?.token;
  if (!token || typeof token !== "string") {
    return new Response(JSON.stringify({ ok: false, error: "Missing token" }), { status: 400 });
  }

  const [existing] = await pipe([["GET", TOKEN_KEY]]);
  if (!existing) {
    await pipe([["SET", TOKEN_KEY, token]]);
    return new Response(JSON.stringify({ ok: true, bootstrapped: true }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  if (existing !== token) {
    return new Response(JSON.stringify({ ok: false, error: "Token mismatch" }), { status: 401 });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
