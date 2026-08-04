/**
 * Admin authentication — separate from the site's user auth.
 *
 * The /admin route has its own username + password gate. A default credential
 * is bootstrapped internally on first load; afterwards the stored hash is used.
 * Credentials are stored in localStorage (password hashed with djb2+salt,
 * same non-crypto scheme as the rest of this demo app — swap for real hashing
 * + a backend for production). Sessions expire after 12h.
 */

const CRED_KEY = "luffytv_admin_cred";
const SESSION_KEY = "luffytv_admin_session";
const SESSION_TTL = 12 * 60 * 60 * 1000;
const TOKEN_KEY = "luffytv_admin_token";

// ── Internal default admin credential (username: "aznayeem", password: "fahadtasin") ──
const DEFAULT_ADMIN_USERNAME = "aznayeem";
const DEFAULT_ADMIN_PASSWORD = "fahadtasin";

function hash(s: string): string {
  let h = 5381;
  const salted = `luffytv_admin_${s}_v1`;
  for (let i = 0; i < salted.length; i++) {
    h = ((h << 5) + h) + salted.charCodeAt(i);
    h = h & 0xffffffff;
  }
  return h.toString(16);
}

type Cred = { username: string; passwordHash: string; createdAt: number };

function loadCred(): Cred | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CRED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Force-set the default admin credential into localStorage.
 *  Always writes the owner credential to ensure the admin panel login
 *  always works with the correct password, even if a previous session
 *  left a different (or broken) credential behind. */
export function bootstrapAdminCredential(): void {
  if (typeof window === "undefined") return;
  const cred: Cred = {
    username: DEFAULT_ADMIN_USERNAME,
    passwordHash: hash(DEFAULT_ADMIN_PASSWORD),
    createdAt: Date.now(),
  };
  try { localStorage.setItem(CRED_KEY, JSON.stringify(cred)); } catch {}
  syncAdminToken(cred.passwordHash);
}

export function hasAdminCredential(): boolean {
  return !!loadCred();
}

export function setAdminCredential(username: string, password: string): { ok: boolean; error?: string } {
  const u = username.trim();
  if (u.length < 3) return { ok: false, error: "Username must be at least 3 characters" };
  if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters" };
  const cred: Cred = { username: u, passwordHash: hash(password), createdAt: Date.now() };
  try { localStorage.setItem(CRED_KEY, JSON.stringify(cred)); } catch {}
  syncAdminToken(cred.passwordHash);
  return { ok: true };
}

export function verifyAdmin(username: string, password: string): boolean {
  const cred = loadCred();
  if (!cred) return false;
  const ok = cred.username.toLowerCase() === username.trim().toLowerCase() && cred.passwordHash === hash(password);
  if (ok) syncAdminToken(cred.passwordHash);
  return ok;
}

/** Shares the local admin password hash with the server (KV) so moderation
 *  mutation endpoints (ban/unban/suspend) can verify this browser is really
 *  the admin, without a real backend session system. */
function syncAdminToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  try {
    fetch("/api/admin/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    }).catch(() => {});
  } catch {}
}

/** The token to send as `x-admin-token` on moderation API calls. */
export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getAdminUsername(): string {
  return loadCred()?.username || "admin";
}

export function changeAdminPassword(oldPassword: string, newPassword: string): { ok: boolean; error?: string } {
  const cred = loadCred();
  if (!cred) return { ok: false, error: "No admin credential set" };
  if (cred.passwordHash !== hash(oldPassword)) return { ok: false, error: "Current password is incorrect" };
  if (newPassword.length < 6) return { ok: false, error: "New password must be at least 6 characters" };
  cred.passwordHash = hash(newPassword);
  try { localStorage.setItem(CRED_KEY, JSON.stringify(cred)); } catch {}
  return { ok: true };
}

export function startAdminSession() {
  try {
    localStorage.setItem(SESSION_KEY, String(Date.now() + SESSION_TTL));
    // Mark this browser as the owner's so their own visits aren't counted as traffic.
    localStorage.setItem("luffytv_owner", "1");
  } catch {}
}

export function isAdminSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    return Date.now() < Number(raw);
  } catch {
    return false;
  }
}

export function endAdminSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}
