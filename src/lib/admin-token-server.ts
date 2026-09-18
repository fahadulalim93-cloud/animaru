/**
 * Backward-compatible admin token validation.
 *
 * The old system used a djb2 hash stored in KV as "admin:token".
 * The new system uses PostgreSQL AdminSession with bcrypt + HTTP-only cookies.
 *
 * This module provides a bridge: `isValidAdminToken()` still works for legacy
 * API routes that use the x-admin-token header, while new routes should use
 * the cookie-based `adminGuard()` from admin-auth-server.ts.
 */

import { pipe } from "@/lib/kv";

const TOKEN_KEY = "admin:token";

/** Legacy check: does this token match the claimed admin token in KV?
 *  Used by mod and donate API routes that haven't been migrated yet. */
export async function isValidAdminToken(token: string | null): Promise<boolean> {
  if (!token) return false;
  const [existing] = await pipe([["GET", TOKEN_KEY]]);
  if (!existing) return false;
  return existing === token;
}

export { TOKEN_KEY };
