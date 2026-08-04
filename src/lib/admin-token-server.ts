import { pipe } from "@/lib/kv";

const TOKEN_KEY = "admin:token";

/** Server-side check: does this token match the claimed admin token in KV? */
export async function isValidAdminToken(token: string | null): Promise<boolean> {
  if (!token) return false;
  const [existing] = await pipe([["GET", TOKEN_KEY]]);
  if (!existing) return false;
  return existing === token;
}

export { TOKEN_KEY };
