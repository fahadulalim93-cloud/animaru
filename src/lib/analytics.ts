/**
 * Lightweight, privacy-friendly analytics — localStorage-backed.
 *
 * WHY LOCALSTORAGE: the app has no writable database on Vercel (SQLite is
 * read-only on serverless), so — exactly like auth & comments — analytics are
 * recorded per-browser in localStorage. Everything here is real data collected
 * from actual usage of THIS deployment in THIS browser. It is structured so it
 * can later be swapped for a server endpoint (POST each event to /api/analytics
 * backed by Vercel KV / Postgres) to aggregate across all visitors & devices.
 *
 * Metrics computed: page views, sessions, bounce rate, returning vs new,
 * average session length, active-now, top pages, referrers, and daily series.
 */

const KEY = "luffytv_analytics";
const SESSION_GAP = 30 * 60 * 1000; // 30 min of inactivity ends a session
const ACTIVE_WINDOW = 5 * 60 * 1000; // "active now" = seen in last 5 min
const MAX_VIEWS = 4000;
const MAX_SESSIONS = 2000;

export interface Session {
  id: string;
  start: number;
  end: number;
  views: number;
  referrer: string;
  entry: string;
}
export interface PageView {
  ts: number;
  path: string;
}
export interface AnalyticsData {
  visitorId: string;
  firstSeen: number;
  lastSeen: number;
  sessions: Session[];
  views: PageView[];
}

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function empty(): AnalyticsData {
  const now = Date.now();
  return { visitorId: uid(), firstSeen: now, lastSeen: now, sessions: [], views: [] };
}

export function loadAnalytics(): AnalyticsData {
  if (typeof window === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return empty();
    return {
      visitorId: parsed.visitorId || uid(),
      firstSeen: parsed.firstSeen || Date.now(),
      lastSeen: parsed.lastSeen || Date.now(),
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      views: Array.isArray(parsed.views) ? parsed.views : [],
    };
  } catch {
    return empty();
  }
}

function save(data: AnalyticsData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

/* ── Real server-side beacon (counts every visitor, aggregated in KV) ── */
function getVisitorId(): string {
  try {
    let v = localStorage.getItem("luffytv_vid");
    if (!v) { v = uid() + uid(); localStorage.setItem("luffytv_vid", v); }
    return v;
  } catch { return "anon"; }
}
export function isOwnerBrowser(): boolean {
  try { return localStorage.getItem("luffytv_owner") === "1"; } catch { return false; }
}
export function setOwnerBrowser(on: boolean) {
  try {
    if (on) localStorage.setItem("luffytv_owner", "1");
    else localStorage.removeItem("luffytv_owner");
  } catch {}
}
function beacon(params: Record<string, string>) {
  try {
    const qs = new URLSearchParams(params).toString();
    fetch(`/api/analytics/track?${qs}`, { method: "GET", keepalive: true, cache: "no-store" }).catch(() => {});
  } catch {}
}
/** Fire once when a new account is created (real signup counter). */
export function trackSignup() {
  if (typeof window === "undefined" || isOwnerBrowser()) return;
  beacon({ event: "signup" });
}

/** Record a page view. Call on every route change. */
export function trackPageview(path: string) {
  if (typeof window === "undefined") return;

  // Real analytics: beacon the server (skips the owner's own browser & /admin).
  if (!isOwnerBrowser() && path !== "admin") {
    let newSess = false;
    try { if (!sessionStorage.getItem("ltv_s")) { sessionStorage.setItem("ltv_s", "1"); newSess = true; } } catch {}
    let ref = "direct";
    try { const r = document.referrer; if (r && !r.includes(location.host)) ref = new URL(r).hostname.replace(/^www\./, ""); } catch {}
    beacon({ p: path, vid: getVisitorId(), r: ref, s: newSess ? "1" : "0" });
  }

  const data = loadAnalytics();
  const now = Date.now();
  const gap = now - data.lastSeen;
  const cur = data.sessions[data.sessions.length - 1];

  if (cur && gap < SESSION_GAP && data.sessions.length > 0) {
    cur.end = now;
    cur.views += 1;
  } else {
    let referrer = "direct";
    try {
      const r = document.referrer;
      if (r && !r.includes(window.location.host)) referrer = new URL(r).hostname;
    } catch {}
    data.sessions.push({ id: uid(), start: now, end: now, views: 1, referrer, entry: path });
    if (data.sessions.length > MAX_SESSIONS) data.sessions = data.sessions.slice(-MAX_SESSIONS);
  }

  data.views.push({ ts: now, path });
  if (data.views.length > MAX_VIEWS) data.views = data.views.slice(-MAX_VIEWS);
  data.lastSeen = now;
  save(data);
}

const DAY = 86400000;
function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface AnalyticsMetrics {
  visitorId: string;
  firstSeen: number;
  totalViews: number;
  totalSessions: number;
  bounceRate: number;        // % of sessions with a single page view
  returningSessions: number; // sessions beyond the first
  returningRate: number;     // % returning
  avgSessionSec: number;
  activeNow: number;         // 1 if seen in last 5 min, else 0
  viewsToday: number;
  views7d: number;
  sessionsToday: number;
  sessions7d: number;
  topPaths: { path: string; count: number }[];
  referrers: { source: string; count: number }[];
  daily: { day: number; views: number; sessions: number }[]; // last 14 days
}

export function getMetrics(data: AnalyticsData = loadAnalytics()): AnalyticsMetrics {
  const now = Date.now();
  const totalSessions = data.sessions.length;
  const totalViews = data.views.length;
  const bounced = data.sessions.filter((s) => s.views <= 1).length;
  const bounceRate = totalSessions ? Math.round((bounced / totalSessions) * 100) : 0;
  const returningSessions = Math.max(0, totalSessions - 1);
  const returningRate = totalSessions ? Math.round((returningSessions / totalSessions) * 100) : 0;
  const durations = data.sessions.map((s) => s.end - s.start);
  const avgSessionSec = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000) : 0;
  const activeNow = now - data.lastSeen < ACTIVE_WINDOW ? 1 : 0;

  const todayStart = dayStart(now);
  const weekStart = todayStart - 6 * DAY;
  const viewsToday = data.views.filter((v) => v.ts >= todayStart).length;
  const views7d = data.views.filter((v) => v.ts >= weekStart).length;
  const sessionsToday = data.sessions.filter((s) => s.start >= todayStart).length;
  const sessions7d = data.sessions.filter((s) => s.start >= weekStart).length;

  const pathCount = new Map<string, number>();
  for (const v of data.views) pathCount.set(v.path, (pathCount.get(v.path) || 0) + 1);
  const topPaths = [...pathCount.entries()].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 8);

  const refCount = new Map<string, number>();
  for (const s of data.sessions) refCount.set(s.referrer, (refCount.get(s.referrer) || 0) + 1);
  const referrers = [...refCount.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 6);

  const daily: { day: number; views: number; sessions: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d0 = todayStart - i * DAY;
    const d1 = d0 + DAY;
    daily.push({
      day: d0,
      views: data.views.filter((v) => v.ts >= d0 && v.ts < d1).length,
      sessions: data.sessions.filter((s) => s.start >= d0 && s.start < d1).length,
    });
  }

  return {
    visitorId: data.visitorId,
    firstSeen: data.firstSeen,
    totalViews,
    totalSessions,
    bounceRate,
    returningSessions,
    returningRate,
    avgSessionSec,
    activeNow,
    viewsToday,
    views7d,
    sessionsToday,
    sessions7d,
    topPaths,
    referrers,
    daily,
  };
}

export interface RangeMetrics {
  days: number;
  views: number;
  sessions: number;
  bounceRate: number;
  avgSessionSec: number;
  // % change vs the previous equal-length window (null when no prior data)
  viewsDelta: number | null;
  sessionsDelta: number | null;
  bounceDelta: number | null;
  avgDelta: number | null;
  series: { day: number; views: number; sessions: number }[];
  topPaths: { path: string; count: number }[];
  referrers: { source: string; count: number }[];
}

function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / prev) * 100);
}

/** Metrics for the last `days` days plus deltas vs the previous window. */
export function getRangeMetrics(days: number, data: AnalyticsData = loadAnalytics()): RangeMetrics {
  const todayStart = dayStart(Date.now());
  const winStart = todayStart - (days - 1) * DAY;
  const prevStart = winStart - days * DAY;

  const inWin = (ts: number) => ts >= winStart && ts < todayStart + DAY;
  const inPrev = (ts: number) => ts >= prevStart && ts < winStart;

  const curViews = data.views.filter((v) => inWin(v.ts));
  const prevViews = data.views.filter((v) => inPrev(v.ts));
  const curSessions = data.sessions.filter((s) => inWin(s.start));
  const prevSessions = data.sessions.filter((s) => inPrev(s.start));

  const bounce = (arr: Session[]) => (arr.length ? Math.round((arr.filter((s) => s.views <= 1).length / arr.length) * 100) : 0);
  const avg = (arr: Session[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + (b.end - b.start), 0) / arr.length / 1000) : 0);

  const curBounce = bounce(curSessions);
  const curAvg = avg(curSessions);

  const series: { day: number; views: number; sessions: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d0 = todayStart - i * DAY;
    const d1 = d0 + DAY;
    series.push({
      day: d0,
      views: data.views.filter((v) => v.ts >= d0 && v.ts < d1).length,
      sessions: data.sessions.filter((s) => s.start >= d0 && s.start < d1).length,
    });
  }

  const pathCount = new Map<string, number>();
  for (const v of curViews) pathCount.set(v.path, (pathCount.get(v.path) || 0) + 1);
  const topPaths = [...pathCount.entries()].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 8);

  const refCount = new Map<string, number>();
  for (const s of curSessions) refCount.set(s.referrer, (refCount.get(s.referrer) || 0) + 1);
  const referrers = [...refCount.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 6);

  return {
    days,
    views: curViews.length,
    sessions: curSessions.length,
    bounceRate: curBounce,
    avgSessionSec: curAvg,
    viewsDelta: pctDelta(curViews.length, prevViews.length),
    sessionsDelta: pctDelta(curSessions.length, prevSessions.length),
    bounceDelta: pctDelta(curBounce, bounce(prevSessions)),
    avgDelta: pctDelta(curAvg, avg(prevSessions)),
    series,
    topPaths,
    referrers,
  };
}

/** Seed demo analytics so the dashboard is populated on first run (dev/demo). */
export function seedDemoAnalytics() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(KEY)) return;
  const now = Date.now();
  const paths = ["landing", "home", "movies", "tv", "manga", "novel", "live", "search", "watch", "movie-watch", "profile"];
  const refs = ["google.com", "direct", "t.co", "reddit.com", "bing.com", "youtube.com"];
  const sessions: Session[] = [];
  const views: PageView[] = [];
  for (let d = 29; d >= 0; d--) {
    const dayBase = now - d * DAY;
    const n = 4 + Math.floor(Math.random() * 9);
    for (let i = 0; i < n; i++) {
      const start = dayBase - Math.floor(Math.random() * DAY * 0.5);
      const nv = 1 + Math.floor(Math.random() * 5);
      const dur = nv > 1 ? (30 + Math.floor(Math.random() * 500)) * 1000 : Math.floor(Math.random() * 12) * 1000;
      sessions.push({ id: uid(), start, end: start + dur, views: nv, referrer: refs[Math.floor(Math.random() * refs.length)], entry: paths[Math.floor(Math.random() * 4)] });
      for (let v = 0; v < nv; v++) views.push({ ts: start + v * (dur / nv), path: paths[Math.floor(Math.random() * paths.length)] });
    }
  }
  save({ visitorId: uid(), firstSeen: now - 30 * DAY, lastSeen: now - 90 * 1000, sessions, views });
}

/** Wipe all analytics (admin action). */
export function resetAnalytics() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(KEY); } catch {}
}
