/**
 * MyAnimeList OAuth (authorization code + PKCE) — client-side redirect +
 * a server-side token exchange (MAL requires a client secret, unlike
 * AniList's implicit grant, so the secret exchange happens in
 * /api/auth/mal/token instead of here).
 *
 * Setup: register an app at https://myanimelist.net/apiconfig (App Type:
 * "web"), set its Redirect URL to this site's homepage, then put:
 *   NEXT_PUBLIC_MAL_CLIENT_ID=<client id>
 *   MAL_CLIENT_SECRET=<client secret>       (server-only, no NEXT_PUBLIC_)
 * MAL only supports code_challenge_method=plain (no S256).
 */

export const MAL_CLIENT_ID = process.env.NEXT_PUBLIC_MAL_CLIENT_ID || "";

export function isMalConfigured() {
  return !!MAL_CLIENT_ID;
}

const VERIFIER_KEY = "ltv_mal_code_verifier";

function randomVerifier(length = 96): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/** Kicks off the MAL OAuth redirect. Generates + stashes a PKCE code_verifier first. */
export function startMalAuth() {
  const verifier = randomVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const redirectUri = `${window.location.origin}/`;
  const url = `https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(MAL_CLIENT_ID)}&code_challenge=${encodeURIComponent(verifier)}&code_challenge_method=plain&redirect_uri=${encodeURIComponent(redirectUri)}`;
  window.location.href = url;
}

/** Reads the stashed PKCE verifier (set by startMalAuth) and clears it. */
export function consumeStoredVerifier(): string | null {
  const v = sessionStorage.getItem(VERIFIER_KEY);
  if (v) sessionStorage.removeItem(VERIFIER_KEY);
  return v;
}

/** Parses `?code=...` out of a location.search string. Returns null if not present. */
export function extractMalCodeFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get("code");
}

export interface MalViewer {
  id: number;
  name: string;
  avatar?: string;
}

export interface MalTokenResponse {
  viewer: MalViewer;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Exchanges the authorization code for tokens via our server route (keeps the client secret server-side). */
export async function exchangeMalCode(code: string, codeVerifier: string): Promise<MalTokenResponse> {
  const redirectUri = `${window.location.origin}/`;
  const res = await fetch("/api/auth/mal/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, codeVerifier, redirectUri }),
  });
  if (!res.ok) {
    // Surface the actual server error message (which includes the MAL
    // "invalid_client / Client authentication failed" detail + hint).
    let msg = `MAL token exchange failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}
