/**
 * Next.js Instrumentation — runs on server startup (before first request).
 * Pre-warms the SQLite anime DB cache so the first homepage load is instant.
 *
 * IMPORTANT: This must only run in Node.js runtime (not Edge).
 * The anime-db-sqlite module uses eval('require') to load node:sqlite
 * which is not allowed in Edge Runtime.
 */
export async function register() {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { prewarmCache } = await import("@/lib/anime-db-sqlite");
    prewarmCache();
  } catch (e) {
    console.warn("[instrumentation] SQLite prewarm failed:", e);
  }
}
