import { NextResponse } from "next/server";

// ============================================================
// MATCH STATS API — Proxy to WatchFooty match statistics
// Endpoint: GET /api/match-stats?id=123
// Proxies: https://api.watchfooty.st/api/v1/match/[id]/stats
// Returns: Full match details + boxscore, rosters, commentary, venue
// ============================================================

export const runtime = "edge";

const TIMEOUT = 15000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function makeCtrl() {
  const c = new AbortController();
  setTimeout(() => c.abort(), TIMEOUT);
  return c;
}

// ── Deep conversion: {value, displayValue} objects → primitives ──
// WatchFooty API returns many fields as {value: X, displayValue: "X"} objects.
// React cannot render objects as children, so we must recursively convert them.
// NOTE: Do NOT restrict by key count — WatchFooty objects can have extra keys
// like {value, displayValue, type, shortDisplayValue} which must still be converted.
function deepToPrimitive(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(deepToPrimitive);
  if (typeof obj === "object") {
    // Check for the {value, displayValue} pattern — do NOT limit by key count
    if ("value" in obj || "displayValue" in obj) {
      // This is a WatchFooty value object — extract the primitive
      if ("value" in obj) return deepToPrimitive(obj.value);
      if ("displayValue" in obj) return deepToPrimitive(obj.displayValue);
    }
    // Recursively convert all nested properties
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = deepToPrimitive(v);
    }
    return result;
  }
  return obj;
}

// ── Image Proxy URL helper ──
const PROXY_HOSTS = new Set([
  "dami-tv.pro", "api.watchfooty.st", "streamfree.app",
  "r2.thesportsdb.com", "streamed.pk", "sportsembed.su",
  "api.vipstreamed.live", "api.ppv.to", "a.espncdn.com",
]);

function proxyImageUrl(url: string): string {
  if (!url) return "";
  const PROXY_BASE = process.env.NEXT_PUBLIC_PROXY_BASE || "https://luffytv-proxy.ggy892767.workers.dev";
  if (url.startsWith("/api/image-proxy")) return url;
  if (PROXY_BASE && url.startsWith(PROXY_BASE)) return url;
  try {
    const parsed = new URL(url);
    if (PROXY_HOSTS.has(parsed.hostname) || parsed.hostname.endsWith(".streamed.pk") || parsed.hostname.endsWith(".thesportsdb.com")) {
      if (PROXY_BASE) {
        return `${PROXY_BASE}/proxy/image?url=${encodeURIComponent(url)}`;
      }
      return `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {}
  return url;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const matchId = url.searchParams.get("id");

  if (!matchId) {
    return NextResponse.json(
      { error: "Missing match id parameter. Use ?id=123" },
      { status: 400 }
    );
  }

  try {
    // Fetch match details and stats in parallel
    const [statsRes, detailsRes] = await Promise.allSettled([
      fetch(`https://api.watchfooty.st/api/v1/match/${encodeURIComponent(matchId)}/stats`, {
        signal: makeCtrl().signal,
        headers: { "User-Agent": UA, Accept: "application/json" },
      }),
      fetch(`https://api.watchfooty.st/api/v1/match/${encodeURIComponent(matchId)}`, {
        signal: makeCtrl().signal,
        headers: { "User-Agent": UA, Accept: "application/json" },
      }),
    ]);

    let stats: any = null;
    let details: any = null;

    if (statsRes.status === "fulfilled" && statsRes.value.ok) {
      const rawStats = await statsRes.value.json();
      stats = deepToPrimitive(rawStats);
    }

    if (detailsRes.status === "fulfilled" && detailsRes.value.ok) {
      const rawDetails = await detailsRes.value.json();
      details = deepToPrimitive(rawDetails);
      // Prepend WatchFooty base URL to relative image paths, then proxy them
      if (details && details.teams) {
        if (details.teams.home?.logoUrl) {
          if (!details.teams.home.logoUrl.startsWith("http")) details.teams.home.logoUrl = `https://api.watchfooty.st${details.teams.home.logoUrl}`;
          details.teams.home.logoUrl = proxyImageUrl(details.teams.home.logoUrl);
        }
        if (details.teams.away?.logoUrl) {
          if (!details.teams.away.logoUrl.startsWith("http")) details.teams.away.logoUrl = `https://api.watchfooty.st${details.teams.away.logoUrl}`;
          details.teams.away.logoUrl = proxyImageUrl(details.teams.away.logoUrl);
        }
        if (details.teams.home?.logo) {
          if (!details.teams.home.logo.startsWith("http")) details.teams.home.logo = `https://api.watchfooty.st${details.teams.home.logo}`;
          details.teams.home.logo = proxyImageUrl(details.teams.home.logo);
        }
        if (details.teams.away?.logo) {
          if (!details.teams.away.logo.startsWith("http")) details.teams.away.logo = `https://api.watchfooty.st${details.teams.away.logo}`;
          details.teams.away.logo = proxyImageUrl(details.teams.away.logo);
        }
      }
      if (details && details.leagueLogo) {
        if (!details.leagueLogo.startsWith("http")) details.leagueLogo = `https://api.watchfooty.st${details.leagueLogo}`;
        details.leagueLogo = proxyImageUrl(details.leagueLogo);
      }
      if (details && details.poster) {
        if (!details.poster.startsWith("http")) details.poster = `https://api.watchfooty.st${details.poster}`;
        details.poster = proxyImageUrl(details.poster);
      }
    }

    return NextResponse.json({
      matchId,
      details: details || null,
      statistics: stats?.statistics || stats || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch match stats", errorMessage: error.message, matchId, details: null, statistics: null },
      { status: 500 }
    );
  }
}
