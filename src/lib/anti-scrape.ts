/**
 * Anti-Scrape Core Library
 * 
 * Multi-layer protection:
 * 1. Response encryption — API responses are XOR-encrypted with a rotating key
 *    so raw network traffic shows garbled data, not JSON.
 * 2. Request signing — legitimate browser requests carry a signed token;
 *    scrapers without the signing algorithm get rejected or receive encrypted data.
 * 3. Bot detection — UA string analysis, headless browser signals, cloud provider IPs.
 * 4. Honeypot — fake endpoints that trap scrapers.
 */

import { NextRequest } from "next/server";

// ─── Rotating encryption key (changes every ~5 minutes) ───

let _encKey: string | null = null;
let _encKeyTime = 0;
const KEY_ROTATION_MS = 5 * 60_000; // rotate every 5 min

function getEncKey(): string {
  const now = Date.now();
  if (!_encKey || now - _encKeyTime > KEY_ROTATION_MS) {
    // Generate a 32-char hex key based on time bucket + server secret
    const bucket = Math.floor(now / KEY_ROTATION_MS);
    const secret = process.env.XOR_KEY || "default-anti-scrape-key-change-me";
    _encKey = simpleHash(bucket.toString() + secret);
    _encKeyTime = now;
  }
  return _encKey;
}

/** Simple deterministic hash to hex string */
function simpleHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = 4294967296 * (h2 >>> 0) + (h1 >>> 0);
  return combined.toString(16).padStart(16, "0") + combined.toString(16).padStart(16, "0");
}

// ─── Response Encryption ───

/**
 * XOR-encrypt a string with the rotating key.
 * Returns base64-encoded result.
 */
export function encryptResponse(data: string): string {
  const key = getEncKey();
  const bytes = Buffer.from(data, "utf-8");
  const keyBytes = Buffer.from(key, "utf-8");
  const encrypted = Buffer.alloc(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    encrypted[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return encrypted.toString("base64");
}

/**
 * Decrypt a response (client-side will do this in browser).
 * This is the server-side version for testing.
 */
export function decryptResponse(encoded: string): string {
  const key = getEncKey();
  const encrypted = Buffer.from(encoded, "base64");
  const keyBytes = Buffer.from(key, "utf-8");
  const decrypted = Buffer.alloc(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
  }
  return decrypted.toString("utf-8");
}

/** Get the current encryption key bucket index (for client sync) */
export function getEncKeyBucket(): number {
  return Math.floor(Date.now() / KEY_ROTATION_MS);
}

// ─── Request Signing ───

/**
 * Generate a signed token for the current time window.
 * The client includes this in a custom header; the middleware validates it.
 * Token = HMAC-like(bucket + path + secret) 
 */
export function generateRequestToken(pathname: string): string {
  const bucket = Math.floor(Date.now() / 30_000); // 30-second windows
  const secret = process.env.XOR_KEY || "default-anti-scrape-key-change-me";
  const raw = `${bucket}:${pathname}:${secret}`;
  return simpleHash(raw);
}

/**
 * Validate a request token. Returns true if valid.
 * Checks current bucket and previous bucket (for clock skew).
 */
export function validateRequestToken(
  token: string,
  pathname: string
): boolean {
  const now = Date.now();
  const secret = process.env.XOR_KEY || "default-anti-scrape-key-change-me";

  // Check current and previous 2 buckets (handles 30s skew each side)
  for (let offset = -2; offset <= 0; offset++) {
    const bucket = Math.floor(now / 30_000) + offset;
    const raw = `${bucket}:${pathname}:${secret}`;
    if (simpleHash(raw) === token) return true;
  }
  return false;
}

// ─── Bot Detection ───

/** Known bot user-agent substrings */
const BOT_UA_PATTERNS = [
  // Crawlers & scrapers
  "bot", "crawl", "spider", "scrape", "fetch", "curl", "wget",
  "python-requests", "python-httpx", "aiohttp", "httpie",
  "postmanruntime", "insomnia", "node-fetch", "axios/",
  "got/", "undici", "superagent", "mechanize", "selenium",
  "puppeteer", "playwright", "headless", "phantomjs", "chrome-headless",
  // Automated tools
  "scrapy", "beautifulsoup", "lxml", "htmlunit", "apache-httpclient",
  "okhttp", "java/", "go-http", "reqwest", "ruby",
  // SEO/social bots (let these through — add to whitelist separately)
];

/** Social/SEO bots to ALLOW (they're harmless and good for SEO) */
const ALLOWED_BOT_PATTERNS = [
  "googlebot", "bingbot", "slurp", "duckduckbot", "baiduspider",
  "yandexbot", "facebookexternalhit", "twitterbot", "linkedinbot",
  "whatsapp", "telegrambot", "discordbot", "applebot",
  "embedly", "pinterest", "preview", "slack", "skypeuripreview",
];

/** Known headless browser signals in UA */
const HEADLESS_SIGNALS = [
  "headless", "phantomjs", "chrome-headless",
  "electron/", "awesomium", "prerender",
];

/**
 * Analyze a request for bot signals.
 * Returns a score 0–100 where higher = more likely bot.
 */
export function detectBot(request: NextRequest): {
  score: number;
  reasons: string[];
  isBot: boolean;
  isHeadless: boolean;
  isAllowedSeoBot: boolean;
} {
  const reasons: string[] = [];
  let score = 0;
  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  const url = request.nextUrl;

  // 1. Empty or missing User-Agent
  if (!ua || ua.length < 10) {
    score += 40;
    reasons.push("missing/short-ua");
  }

  // 2. Known bot UA patterns
  const lowerUa = ua.toLowerCase();
  for (const pattern of BOT_UA_PATTERNS) {
    if (lowerUa.includes(pattern)) {
      score += 30;
      reasons.push(`bot-ua:${pattern}`);
      break;
    }
  }

  // 3. Headless browser detection
  let isHeadless = false;
  for (const signal of HEADLESS_SIGNALS) {
    if (lowerUa.includes(signal)) {
      isHeadless = true;
      score += 50;
      reasons.push(`headless:${signal}`);
      break;
    }
  }

  // 4. Check for allowed SEO bots
  let isAllowedSeoBot = false;
  for (const pattern of ALLOWED_BOT_PATTERNS) {
    if (lowerUa.includes(pattern)) {
      isAllowedSeoBot = true;
      score = 0; // reset — these are fine
      reasons.length = 0;
      break;
    }
  }

  // 5. Suspicious headers — headless Chrome often has these
  if (request.headers.get("sec-ch-headless") === "?1") {
    score += 50;
    reasons.push("headless-ch-header");
    isHeadless = true;
  }

  // 6. Missing normal browser headers
  const accept = request.headers.get("accept");
  if (!accept || accept === "*/*") {
    score += 15;
    reasons.push("missing-accept");
  }

  const acceptLang = request.headers.get("accept-language");
  if (!acceptLang) {
    score += 10;
    reasons.push("missing-accept-language");
  }

  const secFetch = request.headers.get("sec-fetch-mode");
  if (!secFetch && url.pathname.startsWith("/api/")) {
    score += 20;
    reasons.push("missing-sec-fetch-mode");
  }

  // 7. Direct API access without referer (scrapers often call APIs directly)
  const referer = request.headers.get("referer");
  if (url.pathname.startsWith("/api/") && !referer) {
    score += 15;
    reasons.push("api-no-referer");
  }

  // 8. Too many requests with same UA to /api/ paths (handled by rate limiter)

  // 9. Path traversal / injection attempts
  const pathStr = url.pathname + url.search;
  if (
    pathStr.includes("..") ||
    pathStr.includes("<script") ||
    pathStr.includes("eval(") ||
    pathStr.includes("__proto__") ||
    pathStr.includes("constructor")
  ) {
    score += 80;
    reasons.push("path-injection");
  }

  // 10. Known scraper IP ranges (cloud providers) — checked in middleware via env

  const isBot = score >= 50 && !isAllowedSeoBot;

  return { score: Math.min(score, 100), reasons, isBot, isHeadless, isAllowedSeoBot };
}

// ─── Response Wrapper ───

/**
 * Wrap an API response with encryption + anti-tamper metadata.
 * If the request comes from a legitimate browser (has valid token),
 * returns normal JSON. Otherwise, returns encrypted payload.
 */
export function wrapApiResponse(
  data: unknown,
  request: NextRequest,
  shouldEncrypt = true
): Response {
  const token = request.headers.get("x-luffy-token");
  const pathname = request.nextUrl.pathname;
  const isLegit = token && validateRequestToken(token, pathname);

  // Remove internal debug fields
  const sanitized = stripDebugFields(data);

  if (isLegit || !shouldEncrypt) {
    // Legit browser — return normal JSON but with a fresh token for next request
    const newToken = generateRequestToken(pathname);
    return new Response(JSON.stringify(sanitized), {
      headers: {
        "Content-Type": "application/json",
        "X-Luffy-Token": newToken,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // Suspicious request — encrypt the payload
  const jsonStr = JSON.stringify(sanitized);
  const encrypted = encryptResponse(jsonStr);
  const bucket = getEncKeyBucket();

  // Return encrypted blob — scrapers see garbled data
  return new Response(
    JSON.stringify({
      _e: 1, // encrypted flag
      _b: bucket, // key bucket (client needs this to decrypt)
      _d: encrypted, // encrypted data
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

/** Strip internal/debug fields from response data */
function stripDebugFields(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(stripDebugFields);
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Strip debug/internal fields
      if (
        key.startsWith("_") ||
        key === "source" ||
        key === "debug" ||
        key === "provider" ||
        key === "miruroTrending"
      ) {
        continue;
      }
      cleaned[key] = stripDebugFields(value);
    }
    return cleaned;
  }
  return data;
}

// ─── Cloud IP Detection ───

/** Check if an IP belongs to known cloud/scraper hosting ranges */
export function isCloudIP(ip: string): boolean {
  // Simple check for known cloud provider IP patterns
  // These ranges are commonly used by scrapers
  const cloudPrefixes = [
    // AWS
    "3.", "4.", "13.", "15.", "18.", "23.", "34.", "35.", "36.",
    "44.", "46.", "47.", "50.", "51.", "52.", "54.", "55.", "57.",
    "63.", "67.", "69.", "72.", "75.", "79.", "87.", "88.", "99.",
    "100.", "103.", "104.", "107.", "108.", "111.", "112.", "116.",
    "117.", "118.", "119.", "120.", "122.", "123.", "124.", "125.",
    "130.", "132.", "134.", "135.", "136.", "137.", "138.", "139.",
    "140.", "142.", "143.", "144.", "145.", "146.", "147.", "148.",
    "149.", "150.", "151.", "152.", "153.", "154.", "155.", "156.",
    "157.", "158.", "159.", "160.", "162.", "163.", "164.", "165.",
    "166.", "167.", "168.", "170.", "171.", "172.", "174.", "176.",
    "177.", "178.", "179.", "180.", "182.", "183.", "184.", "185.",
    "186.", "187.", "188.", "189.", "190.", "191.", "192.", "193.",
    "194.", "195.", "196.", "198.", "199.", "203.", "204.", "205.",
    "206.", "207.", "208.", "209.", "210.", "211.", "212.", "213.",
    "214.", "215.", "216.", "217.", "218.", "219.", "220.", "221.",
    "222.", "223.", "224.", "225.", "226.", "227.", "228.", "229.",
    "230.", "231.", "232.", "233.", "234.", "235.", "236.", "237.",
    "238.", "239.", "240.", "241.", "242.", "243.", "244.", "245.",
    "246.", "247.", "248.", "249.", "250.", "251.", "252.", "253.",
    "254.", "255.",
  ];

  // More targeted: DigitalOcean, Linode, Vultr, Oracle Cloud
  const hostingPrefixes = [
    "64.225.", "138.197.", "138.68.", "142.93.", "143.198.", "159.65.",
    "159.89.", "165.22.", "167.71.", "167.99.", "174.138.", "206.189.",
    "45.55.", "45.63.", "46.101.", "68.183.", "104.131.", "104.248.",
    "107.170.", "128.199.", "139.59.", "146.190.", "157.230.", "178.128.",
    "188.166.", "206.189.", "209.97.", "88.99.",  // DigitalOcean
    "45.33.", "45.56.", "50.116.", "66.175.", "66.228.", "96.126.",  // Linode
    "45.76.", "45.77.", "45.63.", "64.176.", "64.227.", "66.42.",  // Vultr
    "129.146.", "129.148.", "129.152.", "129.156.", "129.159.",  // Oracle
    "140.238.", "144.22.", "147.154.", "150.136.", "152.67.",  // Oracle
    "158.101.", "168.138.", "192.18.", "193.123.",  // Oracle
  ];

  // Check hosting prefixes (more targeted)
  for (const prefix of hostingPrefixes) {
    if (ip.startsWith(prefix)) return true;
  }

  return false;
}
