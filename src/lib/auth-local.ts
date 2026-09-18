/**
 * Auth utility — localStorage-based user management.
 *
 * WHY LOCALSTORAGE (not a real DB):
 *   Users are stored per-browser in localStorage for simplicity and zero-config
 *   signup. Cross-browser visibility is handled by the beacon system
 *   (/api/users/beacon → KV/PostgreSQL-backed directory). This works on any
 *   hosting platform (Vercel, Coolify, Docker) without additional setup.
 *
 *   For production-grade auth with cross-device sync, swap this out for
 *   NextAuth.js (already installed) + a real Postgres DB.
 *
 * Security note:
 *   Passwords are hashed with a simple non-crypto hash (djb2 + salt). This
 *   is NOT cryptographically secure — it only prevents plaintext passwords
 *   from sitting in localStorage. Do NOT use this for anything that handles
 *   real sensitive data.
 */

import { FRAMES } from "../components/anime/avatar-frames";

const USERS_KEY = "luffytv_users";

export type StoredUser = {
  id: string;
  username: string;
  name: string;
  email: string;
  passwordHash: string;
  avatar?: string;
  avatarColor?: string;
  bio?: string;
  createdAt: string;
  // ── Profile customization ──
  accentColor?: string;     // themes XP bar / badges / active tabs
  avatarEmoji?: string;     // optional emoji shown instead of the letter
  banner?: string;          // header banner preset key (see BANNER_PRESETS)
  favorites?: string[];     // favorite genres shown as chips
  tagline?: string;         // short flair under the name
  avatarFrame?: string;     // equipped avatar frame key
  avatarImage?: string;     // custom avatar image (character portrait or imported image/data URI)
  bannerImage?: string;     // custom profile banner image
  googleId?: string;        // set if this account was created/linked via "Continue with Google"
};

const AVATAR_COLORS = [
  "#7c3aed", "#FF6B00", "#FFB800", "#22c55e",
  "#3b82f6", "#ec4899", "#f59e0b", "#10b981",
  "#8b5cf6", "#ef4444", "#06b6d4", "#84cc16",
];

function hashPassword(password: string): string {
  // Simple djb2 hash + salt (NOT crypto-secure, just obfuscation)
  let hash = 5381;
  const salted = `luffytv_salt_${password}_v1`;
  for (let i = 0; i < salted.length; i++) {
    hash = ((hash << 5) + hash) + salted.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return hash.toString(16);
}

function loadUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {}
}

function genId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function pickAvatarColor(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

/** Picks a random equipped-frame key for new accounts.
 *  Only picks from PNG overlay frames (those with a src). Never returns
 *  a CSS-only frame. If no PNG frames are available, returns "none". */
function pickRandomFrame(): string {
  // Only pick PNG overlay frames (have a src URL)
  const png = FRAMES.filter(f => f.key !== "none" && f.src);
  if (png.length > 0) return png[Math.floor(Math.random() * png.length)].key;
  // No PNG frames available — fall back to "none"
  return "none";
}

/** Deterministic default profile picture for accounts that don't bring
 *  their own (e.g. Google sign-in without a photo). Seeded by username so
 *  the same account always gets the same generated avatar. DiceBear is a
 *  free, keyless avatar-generation service — no account/API key needed. */
function defaultAvatarImage(seed: string): string {
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
}

const DEVICE_TOKEN_KEY = "luffytv_user_token";

/** A random per-browser token, persisted once and reused. It proves to the
 *  server "this device is currently signed in as this username" without a
 *  real backend session — used to authorize mod actions (ban/suspend/report)
 *  for whichever account the site owner has promoted to moderator. */
export function getDeviceToken(): string {
  if (typeof window === "undefined") return "";
  try {
    let t = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!t) {
      t = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_TOKEN_KEY, t);
    }
    return t;
  } catch { return ""; }
}

/** Fire-and-forget: registers/refreshes this user in the cross-browser
 *  directory the admin panel reads from (see /api/users/beacon). Without
 *  this, the admin Members tab can only ever see accounts created in the
 *  admin's own browser, since sign-up/sign-in are otherwise fully local. */
function beaconDirectory(user: Omit<StoredUser, "passwordHash">) {
  try {
    fetch("/api/users/beacon", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      cache: "no-store",
      body: JSON.stringify({ id: user.id, username: user.username, name: user.name, email: user.email, createdAt: user.createdAt, token: getDeviceToken() }),
    }).catch(() => {});
  } catch {}
}

export type Role = "member" | "mod";

/** Is the given username currently a moderator? (public read, used to show
 *  the "Mod Tools" entry point once someone with the role logs in). */
export async function getMyRole(username: string): Promise<Role> {
  try {
    const res = await fetch(`/api/users/role?u=${encodeURIComponent(username)}`, { cache: "no-store" });
    const data = await res.json();
    return data.role === "mod" ? "mod" : "member";
  } catch {
    return "member";
  }
}

export type AccountStatus =
  | { blocked: false }
  | { blocked: true; reason: "banned" | "suspended"; message: string };

/** Cross-browser ban/suspend check — call after a successful local signIn
 *  (and before signUp) so admin moderation actually has teeth. */
export async function checkAccountStatus(username: string): Promise<AccountStatus> {
  try {
    const res = await fetch(`/api/users/status?u=${encodeURIComponent(username)}`, { cache: "no-store" });
    const data = await res.json();
    if (data.status === "banned") {
      return { blocked: true, reason: "banned", message: data.reason ? `Your account has been banned: ${data.reason}` : "Your account has been banned." };
    }
    if (data.status === "suspended") {
      const until = data.until ? new Date(data.until).toLocaleString() : "";
      return { blocked: true, reason: "suspended", message: `Your account is suspended${until ? ` until ${until}` : ""}${data.reason ? ` — ${data.reason}` : ""}.` };
    }
    return { blocked: false };
  } catch {
    return { blocked: false };
  }
}

// ── Public API ──

export type SignUpResult =
  | { ok: true; user: Omit<StoredUser, "passwordHash"> }
  | { ok: false; error: string };

export type SignInResult =
  | { ok: true; user: Omit<StoredUser, "passwordHash"> }
  | { ok: false; error: string };

export function signUp(input: {
  username: string;
  name: string;
  email: string;
  password: string;
}): SignUpResult {
  const username = input.username.trim();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (username.length < 3) return { ok: false, error: "Username must be at least 3 characters" };
  if (username.length > 20) return { ok: false, error: "Username must be 20 characters or less" };
  if (!/^[a-zA-Z0-9_]+$/.test(username))
    return { ok: false, error: "Username can only contain letters, numbers, and underscores" };
  if (name.length < 1) return { ok: false, error: "Name is required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { ok: false, error: "Please enter a valid email address" };
  if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters" };

  const users = loadUsers();

  // Check for existing username (case-insensitive)
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: "Username already taken" };
  }
  // Check for existing email
  if (users.some((u) => u.email.toLowerCase() === email)) {
    return { ok: false, error: "Email already registered" };
  }

  const newUser: StoredUser = {
    id: genId(),
    username,
    name,
    email,
    passwordHash: hashPassword(password),
    avatar: username.charAt(0).toUpperCase(),
    avatarColor: pickAvatarColor(username),
    avatarImage: defaultAvatarImage(username),
    avatarFrame: pickRandomFrame(),
    bio: "",
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveUsers(users);

  // Real signup counter (skips the owner's own browser).
  try {
    if (typeof window !== "undefined" && localStorage.getItem("luffytv_owner") !== "1") {
      fetch("/api/analytics/track?event=signup", { method: "GET", keepalive: true, cache: "no-store" }).catch(() => {});
    }
  } catch {}

  // Strip password hash before returning
  const { passwordHash, ...safe } = newUser;
  beaconDirectory(safe);
  return { ok: true, user: safe };
}

export function signIn(input: {
  identifier: string; // username OR email
  password: string;
}): SignInResult {
  const identifier = input.identifier.trim().toLowerCase();
  const password = input.password;

  if (!identifier) return { ok: false, error: "Enter your username or email" };
  if (!password) return { ok: false, error: "Enter your password" };

  const users = loadUsers();
  const user = users.find(
    (u) => u.username.toLowerCase() === identifier || u.email.toLowerCase() === identifier
  );

  if (!user) return { ok: false, error: "No account found with that username or email" };
  if (user.passwordHash !== hashPassword(password)) {
    return { ok: false, error: "Incorrect password" };
  }

  // ── Auto-fill default avatar image & random frame for legacy accounts ──
  // Older accounts (created before these fields existed) may lack them.
  // On every sign-in, backfill so all users have a profile picture + frame.
  let needsSave = false;
  if (!user.avatarImage) {
    user.avatarImage = defaultAvatarImage(user.username);
    needsSave = true;
  }
  if (!user.avatarFrame || user.avatarFrame === "none") {
    user.avatarFrame = pickRandomFrame();
    needsSave = true;
  }
  if (!user.avatar) {
    user.avatar = user.username.charAt(0).toUpperCase();
    needsSave = true;
  }
  if (!user.avatarColor) {
    user.avatarColor = pickAvatarColor(user.username);
    needsSave = true;
  }
  if (needsSave) saveUsers(users);

  const { passwordHash, ...safe } = user;
  beaconDirectory(safe);
  return { ok: true, user: safe };
}

/** Finds or creates a local account from a Google profile — signs the user
 *  in directly (no password), auto-filling name/email/avatar from Google. */
export function signInWithGoogleProfile(profile: { googleId: string; email: string; name: string; picture?: string }): SignInResult {
  const email = profile.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "Google did not share an email address" };

  const users = loadUsers();
  const existing = users.find((u) => u.email.toLowerCase() === email || u.googleId === profile.googleId);
  if (existing) {
    // Keep the linked Google avatar/id fresh, then sign in.
    existing.googleId = profile.googleId;
    if (profile.picture && !existing.avatarImage) existing.avatarImage = profile.picture;
    // ── Backfill default avatar + random frame for legacy accounts ──
    if (!existing.avatarImage) existing.avatarImage = profile.picture || defaultAvatarImage(existing.username);
    if (!existing.avatarFrame || existing.avatarFrame === "none") existing.avatarFrame = pickRandomFrame();
    if (!existing.avatar) existing.avatar = existing.username.charAt(0).toUpperCase();
    if (!existing.avatarColor) existing.avatarColor = pickAvatarColor(existing.username);
    saveUsers(users);
    const { passwordHash, ...safe } = existing;
    beaconDirectory(safe);
    return { ok: true, user: safe };
  }

  // New account — derive a unique username from the Google name/email.
  const base = (profile.name || email.split("@")[0]).toLowerCase().replace(/[^a-z0-9_]/g, "") || "user";
  let username = base.slice(0, 20);
  let n = 1;
  while (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    const suffix = String(n++);
    username = `${base.slice(0, 20 - suffix.length)}${suffix}`;
  }

  const newUser: StoredUser = {
    id: genId(),
    username,
    name: profile.name || username,
    email,
    // Google-authenticated accounts don't use a password — store a random,
    // never-shown hash so the field stays non-empty for the local schema.
    passwordHash: hashPassword(Math.random().toString(36) + Date.now()),
    avatar: (profile.name || username).charAt(0).toUpperCase(),
    avatarColor: pickAvatarColor(username),
    avatarImage: profile.picture || defaultAvatarImage(username),
    avatarFrame: pickRandomFrame(),
    bio: "",
    createdAt: new Date().toISOString(),
    googleId: profile.googleId,
  };

  users.push(newUser);
  saveUsers(users);

  try {
    if (typeof window !== "undefined" && localStorage.getItem("luffytv_owner") !== "1") {
      fetch("/api/analytics/track?event=signup", { method: "GET", keepalive: true, cache: "no-store" }).catch(() => {});
    }
  } catch {}

  const { passwordHash, ...safe } = newUser;
  beaconDirectory(safe);
  return { ok: true, user: safe };
}

export function updateUserProfile(userId: string, updates: {
  name?: string;
  bio?: string;
  avatar?: string;
  avatarColor?: string;
  accentColor?: string;
  avatarEmoji?: string;
  banner?: string;
  favorites?: string[];
  tagline?: string;
  avatarFrame?: string;
  avatarImage?: string;
  bannerImage?: string;
}): Omit<StoredUser, "passwordHash"> | null {
  const users = loadUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...updates };
  saveUsers(users);
  const { passwordHash, ...safe } = users[idx];
  return safe;
}

export function changePassword(userId: string, oldPassword: string, newPassword: string):
  { ok: true } | { ok: false; error: string } {
  const users = loadUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return { ok: false, error: "User not found" };
  if (users[idx].passwordHash !== hashPassword(oldPassword)) {
    return { ok: false, error: "Current password is incorrect" };
  }
  if (newPassword.length < 6) return { ok: false, error: "New password must be at least 6 characters" };
  users[idx].passwordHash = hashPassword(newPassword);
  saveUsers(users);
  return { ok: true };
}

export function listUsersCount(): number {
  return loadUsers().length;
}

/** All registered users on this browser, without password hashes. */
export function listUsersSafe(): Omit<StoredUser, "passwordHash">[] {
  return loadUsers()
    .map(({ passwordHash, ...safe }) => safe)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** True if the given user is the site owner/admin (earliest signup or allow-listed). */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").filter(Boolean);
export function isAdminUser(user: { id?: string; email?: string } | null | undefined): boolean {
  if (!user) return false;
  if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) return true;
  const users = loadUsers();
  if (users.length === 0) return false;
  const earliest = users.slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  return !!user.id && earliest.id === user.id;
}
