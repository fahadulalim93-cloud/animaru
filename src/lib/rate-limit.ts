/**
 * In-memory sliding-window rate limiter.
 * Works without Redis — uses a Map that auto-cleans stale entries.
 * Each IP gets a rolling window of requests.
 */

interface RateBucket {
  timestamps: number[];
}

const buckets = new Map<string, RateBucket>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60_000; // prune every 60s
const MAX_BUCKETS = 50_000; // prevent memory leak

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

/** Default configs per route tier */
export const RATE_LIMITS = {
  /** Public pages — generous */
  pages: { limit: 200, windowMs: 60_000 },
  /** General API — moderate */
  api: { limit: 120, windowMs: 60_000 },
  /** Search — stricter */
  search: { limit: 30, windowMs: 60_000 },
  /** Stream/server endpoints — the watch page fires 5-10 parallel calls per
   *  episode load (instant-servers, miruro-v3, anixtv-servers, embed-servers, etc.)
   *  plus additional calls when switching audio/server/episode. 80/min allows
   *  normal browsing while still throttling rapid-fire scrapers.
   *  VPS FIX: Increased from 40 to 80 — one page load = 5-10 API calls. */
  stream: { limit: 80, windowMs: 60_000 },
  /** Scraper endpoints — very strict */
  scraper: { limit: 20, windowMs: 60_000 },
} as const;

/**
 * Check if a request should be rate-limited.
 * Returns { allowed: true } or { allowed: false, retryAfterMs }
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const now = Date.now();

  // Periodic cleanup
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    cleanupStale(now, config.windowMs);
    lastCleanup = now;
  }

  // Hard cap on tracked IPs
  if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    // Evict oldest entry
    const oldest = buckets.keys().next().value;
    if (oldest) buckets.delete(oldest);
  }

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  // Remove timestamps outside the window
  const windowStart = now - config.windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);

  if (bucket.timestamps.length >= config.limit) {
    const oldestInWindow = bucket.timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(1, retryAfterMs) };
  }

  bucket.timestamps.push(now);
  return { allowed: true };
}

function cleanupStale(now: number, maxWindow: number) {
  const cutoff = now - maxWindow * 2; // keep 2x window for safety
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
    if (bucket.timestamps.length === 0) {
      buckets.delete(key);
    }
  }
}

/** Get the appropriate rate limit tier for a pathname */
export function getRateLimitTier(pathname: string): RateLimitConfig {
  if (pathname.includes('/scraper/')) return RATE_LIMITS.scraper;
  if (
    pathname.includes('/servers/') ||
    pathname.includes('/instant-servers/') ||
    pathname.includes('/miruro-v3/') ||
    pathname.includes('/animesalt-servers/') ||
    pathname.includes('/animex-servers/') ||
    pathname.includes('/anidap-servers/') ||
    pathname.includes('/animostream-hindi/') ||
    pathname.includes('/hindi-streams/') ||
    pathname.includes('/embed-servers/') ||
    pathname.includes('/watch') ||
    pathname.includes('/stream/') ||
    pathname.includes('/hls-proxy') ||
    pathname.includes('/hls-resolve') ||
    pathname.includes('/download') ||
    pathname.includes('/decrypt') ||
    pathname.includes('/embed-proxy') ||
    pathname.includes('/image-proxy')
  )
    return RATE_LIMITS.stream;
  if (pathname.includes('/search') || pathname.includes('/browse'))
    return RATE_LIMITS.search;
  if (pathname.startsWith('/api/')) return RATE_LIMITS.api;
  return RATE_LIMITS.pages;
}
