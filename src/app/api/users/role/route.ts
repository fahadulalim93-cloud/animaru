import { pipe } from "@/lib/kv";
import { ROLES_KEY } from "@/lib/moderation-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Public read: does this username currently hold a special role (mod)? */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const username = (url.searchParams.get("u") || "").trim().toLowerCase();
  if (!username) {
    return new Response(JSON.stringify({ role: "member" }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  const [role] = await pipe([["HGET", ROLES_KEY, username]]);
  return new Response(JSON.stringify({ role: role === "mod" ? "mod" : "member" }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
