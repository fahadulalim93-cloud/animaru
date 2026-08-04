"use client";

import { useState, useMemo, useEffect, useCallback, useSyncExternalStore } from "react";
import {
  hasAdminCredential, setAdminCredential, verifyAdmin, getAdminUsername,
  changeAdminPassword, startAdminSession, isAdminSession, endAdminSession,
  getAdminToken, bootstrapAdminCredential,
} from "@/lib/admin-auth";
import { setOwnerBrowser, isOwnerBrowser } from "@/lib/analytics";
import { loadSeo, saveSeo, auditSeo, DEFAULT_SEO, type SeoSettings } from "@/lib/seo-config";

/* ============================================================
   Real analytics (server / KV) — types + fetch hook
   ============================================================ */
export interface Stats {
  kvEnabled: boolean;
  range: number;
  totalViews: number;
  totalSessions: number;
  uniqueVisitors: number;
  onlineNow: number;
  signupsTotal: number;
  views: number; viewsDelta: number | null;
  sessions: number; sessionsDelta: number | null;
  signups: number; signupsDelta: number | null;
  series: { day: number; views: number; sessions: number }[];
  topPaths: { path: string; count: number }[];
  referrers: { source: string; count: number }[];
  countries: { code: string; count: number }[];
  devices: { name: string; count: number }[];
}

/* ============================================================
   Members directory (cross-browser, KV-backed) + moderation actions
   ============================================================ */
export interface Member {
  id: string;
  username: string;
  name: string;
  email: string;
  createdAt: string;
  lastSeen: number;
  status: "active" | "banned" | "suspended";
  reason: string | null;
  until: number | null;
  role: "member" | "mod";
}

function useMembers(refreshKey: number) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let cancel = false;
    Promise.resolve().then(async () => {
      const token = getAdminToken();
      if (!token) throw new Error("No admin token");
      const r = await fetch("/api/admin/moderation", { headers: { "x-admin-token": token }, cache: "no-store" });
      return r.json();
    }).then((d) => {
      if (cancel) return;
      if (d.ok) { setMembers(d.members); setError(null); }
      else setError(d.error || "Failed to load members");
    }).catch((e) => { if (!cancel) setError(e instanceof Error ? e.message : "Failed to load members"); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [refreshKey, bump]);

  const mutate = useCallback(async (username: string, action: "ban" | "unban" | "suspend" | "unsuspend" | "promote" | "demote", opts?: { reason?: string; hours?: number }) => {
    const token = getAdminToken();
    if (!token) return { ok: false, error: "No admin token" };
    const res = await fetch("/api/admin/moderation", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ username, action, ...opts }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "Network error" }));
    if (res.ok) setBump((b) => b + 1);
    return res;
  }, []);

  return { members, loading, error, mutate };
}

function useStats(range: number, refreshKey: number) {
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancel = false;
    fetch(`/api/analytics/stats?days=${range}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Stats) => { if (!cancel) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [range, refreshKey]);
  return { data, loading };
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", IN: "India", CA: "Canada", DE: "Germany", FR: "France",
  BR: "Brazil", JP: "Japan", AU: "Australia", PH: "Philippines", ID: "Indonesia", NG: "Nigeria",
  PK: "Pakistan", BD: "Bangladesh", MX: "Mexico", ES: "Spain", IT: "Italy", NL: "Netherlands",
  RU: "Russia", TR: "Turkey", SA: "Saudi Arabia", AE: "UAE", EG: "Egypt", ZA: "South Africa",
  KR: "South Korea", SE: "Sweden", PL: "Poland", VN: "Vietnam", TH: "Thailand", MY: "Malaysia",
  "??": "Unknown",
};
function flag(cc: string): string {
  if (cc.length !== 2 || cc === "??") return "🌐";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/* ============================================================
   Admin theme / customization (persisted)
   ============================================================ */
const ACCENTS = [
  { id: "blue", v: "#3b82f6" }, { id: "violet", v: "#8b5cf6" }, { id: "emerald", v: "#10b981" },
  { id: "amber", v: "#f59e0b" }, { id: "rose", v: "#f43f5e" }, { id: "cyan", v: "#06b6d4" },
];
const THEME_KEY = "luffytv_admin_accent";
function loadAccent(): string { try { return localStorage.getItem(THEME_KEY) || "#3b82f6"; } catch { return "#3b82f6"; } }
function saveAccent(v: string) { try { localStorage.setItem(THEME_KEY, v); } catch {} }

/* ============================================================
   Mounted gate (avoid SSR/localStorage hydration mismatch)
   ============================================================ */
const sub = () => () => {};
function useMounted() { return useSyncExternalStore(sub, () => true, () => false); }

export default function AdminApp() {
  const mounted = useMounted();
  // Bootstrap default admin credential synchronously BEFORE render
  // so AuthScreen's useState initializer sees the correct credential.
  if (mounted) bootstrapAdminCredential();
  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
      </div>
    );
  }
  return <AdminGate />;
}

/* ============================================================
   Auth gate — setup / login / dashboard
   ============================================================ */
function AdminGate() {
  const [authed, setAuthed] = useState(() => isAdminSession());
  if (authed) return <Dashboard onLogout={() => { endAdminSession(); setAuthed(false); }} />;
  return <AuthScreen onAuthed={() => setAuthed(true)} />;
}

function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode] = useState<"setup" | "login">(hasAdminCredential() ? "login" : "setup");
  const [username, setUsername] = useState(mode === "login" ? getAdminUsername() : "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [accent] = useState(loadAccent);

  const submit = () => {
    setError("");
    if (mode === "setup") {
      if (password !== confirm) { setError("Passwords do not match"); return; }
      const r = setAdminCredential(username, password);
      if (!r.ok) { setError(r.error || "Could not create credential"); return; }
      startAdminSession();
      onAuthed();
    } else {
      if (!verifyAdmin(username, password)) { setError("Invalid username or password"); return; }
      startAdminSession();
      onAuthed();
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-white flex items-center justify-center px-4"
      style={{ backgroundImage: `radial-gradient(circle at 20% 0%, ${accent}22, transparent 45%), radial-gradient(circle at 85% 100%, ${accent}15, transparent 45%)` }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black" style={{ backgroundColor: accent }}>L</div>
          <div>
            <p className="font-black text-lg leading-none">Luffy TV</p>
            <p className="text-[11px] text-white/40">Admin Console</p>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#111722] p-6 shadow-2xl">
          <h1 className="text-lg font-bold mb-1">{mode === "setup" ? "Create admin access" : "Admin sign in"}</h1>
          <p className="text-xs text-white/45 mb-5">{mode === "setup" ? "Set the credentials for this admin console." : "Enter your admin credentials to continue."}</p>

          <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1.5">Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus={mode === "setup"}
            className="w-full px-3.5 py-2.5 rounded-lg bg-[#0b0e14] border border-white/10 text-sm outline-none focus:border-white/30 mb-4" placeholder="admin" />

          <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1.5">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && mode === "login" && submit()}
            className="w-full px-3.5 py-2.5 rounded-lg bg-[#0b0e14] border border-white/10 text-sm outline-none focus:border-white/30 mb-4" placeholder="••••••••" />

          {mode === "setup" && (
            <>
              <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1.5">Confirm password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0b0e14] border border-white/10 text-sm outline-none focus:border-white/30 mb-4" placeholder="••••••••" />
            </>
          )}

          {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

          <button onClick={submit} className="w-full py-2.5 rounded-lg text-black text-sm font-bold hover:opacity-90 transition-opacity" style={{ backgroundColor: accent }}>
            {mode === "setup" ? "Create & enter" : "Sign in"}
          </button>
          <a href="/" className="block text-center text-xs text-white/40 hover:text-white/70 mt-4">← Back to site</a>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Dashboard shell (sidebar + topbar)
   ============================================================ */
type Tab = "dashboard" | "users" | "xp" | "reports" | "announcements" | "seo" | "content" | "audience" | "settings";
const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Overview", icon: "grid" },
  { id: "users", label: "Members", icon: "user" },
  { id: "xp", label: "XP Leaderboard", icon: "sparkle" },
  { id: "reports", label: "Reports", icon: "flag" },
  { id: "announcements", label: "Announcements", icon: "megaphone" },
  { id: "seo", label: "SEO", icon: "search" },
  { id: "content", label: "Content", icon: "film" },
  { id: "audience", label: "Audience", icon: "users" },
  { id: "settings", label: "Settings", icon: "cog" },
];

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [range, setRange] = useState<7 | 14 | 30>(14);
  const [accent, setAccent] = useState(loadAccent);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: stats, loading } = useStats(range, refreshKey);
  const { members, loading: membersLoading, error: membersError, mutate } = useMembers(refreshKey);

  // Live auto-refresh every 30s (keeps "online now" & counters fresh).
  useEffect(() => {
    const id = setInterval(() => setRefreshKey((k) => k + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const setAcc = (v: string) => { setAccent(v); saveAccent(v); };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-white flex" style={{ ["--acc" as string]: accent }}>
      {/* Mobile backdrop */}
      {mobileOpen && <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}
      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 z-40 h-screen w-60 ${collapsed ? "lg:w-16" : "lg:w-60"} shrink-0 border-r border-white/[0.06] bg-[#0e131c] flex flex-col transition-all duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="h-16 flex items-center gap-2.5 px-4 border-b border-white/[0.06]">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base font-black shrink-0" style={{ backgroundColor: accent }}>L</div>
          <div className={collapsed ? "lg:hidden" : ""}><p className="font-black text-sm leading-none">Luffy TV</p><p className="text-[10px] text-white/40 mt-0.5">Admin</p></div>
        </div>
        <nav className="flex-1 p-2.5 space-y-1">
          {NAV.map((n) => {
            const active = tab === n.id;
            return (
              <button key={n.id} onClick={() => { setTab(n.id); setMobileOpen(false); }} title={n.label}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${active ? "text-white" : "text-white/45 hover:text-white/80 hover:bg-white/[0.04]"}`}
                style={active ? { backgroundColor: accent + "1f", color: accent } : undefined}>
                <NavIcon name={n.icon} />
                <span className={collapsed ? "lg:hidden" : ""}>{n.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="p-2.5 border-t border-white/[0.06] space-y-1">
          <button onClick={() => setCollapsed((c) => !c)} className="hidden lg:flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-white/45 hover:text-white/80 hover:bg-white/[0.04]">
            <NavIcon name={collapsed ? "expand" : "collapse"} /><span className={collapsed ? "lg:hidden" : ""}>Collapse</span>
          </button>
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-red-400/80 hover:text-red-400 hover:bg-red-500/10">
            <NavIcon name="logout" /><span className={collapsed ? "lg:hidden" : ""}>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="h-16 shrink-0 border-b border-white/[0.06] bg-[#0b0e14]/80 backdrop-blur sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden w-9 h-9 rounded-lg border border-white/10 flex items-center justify-center text-white/70" aria-label="Open menu">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div>
              <h1 className="text-lg font-black capitalize leading-none">{tab === "users" ? "Members" : tab === "xp" ? "XP Leaderboard" : tab === "announcements" ? "Announcements" : tab}</h1>
              <p className="text-[11px] text-white/40 mt-0.5 hidden sm:block">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(tab === "dashboard" || tab === "audience" || tab === "content") && (
              <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs font-bold">
                {[7, 14, 30].map((d) => (
                  <button key={d} onClick={() => setRange(d as 7 | 14 | 30)}
                    className="px-2.5 py-1.5 transition-colors" style={range === d ? { backgroundColor: accent, color: "#000" } : { color: "rgba(255,255,255,0.5)" }}>{d}d</button>
                ))}
              </div>
            )}
            <button onClick={() => setRefreshKey((k) => k + 1)} className="w-9 h-9 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.05]" title="Refresh">
              <NavIcon name="refresh" />
            </button>
            <a href="/" className="hidden sm:flex items-center gap-1.5 px-3 h-9 rounded-lg border border-white/10 text-xs font-bold text-white/60 hover:text-white hover:bg-white/[0.05]">View site</a>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black" style={{ backgroundColor: accent + "33", color: accent }}>{getAdminUsername().charAt(0).toUpperCase()}</div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
          {stats && !stats.kvEnabled && (tab === "dashboard" || tab === "audience" || tab === "content") && <KvBanner />}
          {loading && !stats ? (
            <div className="flex items-center justify-center py-24"><div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" /></div>
          ) : (
            <>
              {tab === "dashboard" && <DashboardTab s={stats} userCount={members?.length ?? 0} accent={accent} />}
              {tab === "users" && <UsersTab members={members} loading={membersLoading} error={membersError} mutate={mutate} accent={accent} />}
              {tab === "xp" && <XpLeaderboardTab accent={accent} />}
              {tab === "reports" && <ReportsTab accent={accent} />}
              {tab === "announcements" && <AnnouncementsTab accent={accent} />}
              {tab === "seo" && <SeoTab accent={accent} />}
              {tab === "content" && <ContentTab s={stats} accent={accent} />}
              {tab === "audience" && <AudienceTab s={stats} accent={accent} />}
              {tab === "settings" && <SettingsTab accent={accent} setAccent={setAcc} onData={() => setRefreshKey((k) => k + 1)} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/* ============================================================
   Reusable UI
   ============================================================ */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/[0.07] bg-[#111722] ${className}`}>{children}</div>;
}

function Delta({ v, invert = false }: { v: number | null; invert?: boolean }) {
  if (v === null) return <span className="text-[11px] text-white/30">— new</span>;
  const good = invert ? v <= 0 : v >= 0;
  return (
    <span className={`text-[11px] font-bold flex items-center gap-0.5 ${good ? "text-emerald-400" : "text-red-400"}`}>
      {v >= 0 ? "▲" : "▼"} {Math.abs(v)}%
    </span>
  );
}

function Kpi({ label, value, delta, invert, icon, accent, spark }: { label: string; value: string | number; delta?: number | null; invert?: boolean; icon: string; accent: string; spark?: number[] }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: accent + "1f", color: accent }}><NavIcon name={icon} /></div>
        {delta !== undefined && <Delta v={delta ?? null} invert={invert} />}
      </div>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-[11px] text-white/45 mt-0.5">{label}</p>
      {spark && spark.length > 1 && <Sparkline data={spark} accent={accent} />}
    </Card>
  );
}

function Sparkline({ data, accent }: { data: number[]; accent: string }) {
  const max = Math.max(1, ...data);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * 100},${28 - (d / max) * 24}`).join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-6 mt-2">
      <polyline points={pts} fill="none" stroke={accent} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function AreaChart({ series, accent }: { series: { day: number; views: number; sessions: number }[]; accent: string }) {
  const W = 700, H = 220, P = 8;
  const max = Math.max(1, ...series.map((s) => Math.max(s.views, s.sessions)));
  const x = (i: number) => P + (i / Math.max(1, series.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P - 16);
  const line = (key: "views" | "sessions") => series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(s[key])}`).join(" ");
  const area = `${line("views")} L${x(series.length - 1)},${H - P} L${x(0)},${H - P} Z`;
  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-56">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={P} x2={W - P} y1={H - P - g * (H - 2 * P - 16)} y2={H - P - g * (H - 2 * P - 16)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#areaFill)" />
        <path d={line("views")} fill="none" stroke={accent} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={line("sessions")} fill="none" stroke="#22D3EE" strokeWidth="2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex items-center gap-4 mt-2 text-[11px] text-white/45 px-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ backgroundColor: accent }} /> Page views</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-[#22D3EE]" /> Sessions</span>
        <span className="ml-auto">{new Date(series[0]?.day).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – today</span>
      </div>
    </div>
  );
}

function Donut({ data, accent }: { data: { label: string; value: number; color: string }[]; accent: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="text-sm text-white/40 text-center py-8">No data yet.</p>;
  const R = 42, C = 2 * Math.PI * R;
  const segments = data.reduce<{ d: typeof data[number]; start: number }[]>((acc, d) => {
    const prev = acc.length ? acc[acc.length - 1] : null;
    const start = prev ? prev.start + prev.d.value / total : 0;
    return [...acc, { d, start }];
  }, []);
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
        {segments.map(({ d, start }, i) => (
          <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={d.color} strokeWidth="12" strokeDasharray={`${(d.value / total) * C} ${C}`} strokeDashoffset={-start * C} />
        ))}
      </svg>
      <div className="flex-1 min-w-0 space-y-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-white/60 flex-1 truncate">{d.label}</span>
            <span className="font-bold tabular-nums">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarList({ rows, accent }: { rows: { label: string; value: number }[]; accent: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-white/35 text-center py-6">No data yet.</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="text-xs text-white/55 w-28 truncate shrink-0">{r.label}</span>
          <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: accent }} /></div>
          <span className="text-xs font-bold tabular-nums w-9 text-right">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function PanelHead({ title, sub }: { title: string; sub?: string }) {
  return <div className="mb-4"><h2 className="text-sm font-bold">{title}</h2>{sub && <p className="text-[11px] text-white/40 mt-0.5">{sub}</p>}</div>;
}

const PAGE_LABELS: Record<string, string> = {
  landing: "Landing", home: "Anime Home", hub: "Hub", movies: "Movies", tv: "TV Shows", manga: "Manga",
  novel: "Novels", live: "Live Sports", search: "Search", profile: "Profile", watch: "Anime Watch",
  "movie-watch": "Movie Watch", "tv-watch": "TV Watch", "manga-read": "Manga Reader", admin: "Admin",
};
const plabel = (p: string) => PAGE_LABELS[p] || p;

/* ============================================================
   KV status banner
   ============================================================ */
function KvBanner() {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 mb-6 flex items-start gap-3">
      <span className="text-lg">⚡</span>
      <div className="text-xs text-amber-200/80 leading-relaxed">
        <span className="font-bold text-amber-300">Local mode — connect a store for real global numbers.</span>{" "}
        Real visitor counting needs a shared datastore. In your Vercel project open <b>Storage → Create → KV</b> and connect it to this
        project. It auto-adds the env vars and every visit is then counted here — automatically, no code changes.
      </div>
    </div>
  );
}

const SOURCE_COLORS = ["#3b82f6", "#22D3EE", "#8b5cf6", "#f59e0b", "#10b981", "#f43f5e"];
const EMPTY: Stats = { kvEnabled: false, range: 14, totalViews: 0, totalSessions: 0, uniqueVisitors: 0, onlineNow: 0, signupsTotal: 0, views: 0, viewsDelta: null, sessions: 0, sessionsDelta: null, signups: 0, signupsDelta: null, series: [], topPaths: [], referrers: [], countries: [], devices: [] };

/* ============================================================
   Tabs (real server data)
   ============================================================ */
function DashboardTab({ s, userCount, accent }: { s: Stats | null; userCount: number; accent: string }) {
  const d = s || EMPTY;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label={`Page views · ${d.range}d`} value={d.views.toLocaleString()} delta={d.viewsDelta} icon="eye" accent={accent} spark={d.series.map((x) => x.views)} />
        <Kpi label={`Unique visitors · all-time`} value={d.uniqueVisitors.toLocaleString()} icon="user" accent="#8b5cf6" />
        <Kpi label={`Sessions · ${d.range}d`} value={d.sessions.toLocaleString()} delta={d.sessionsDelta} icon="cursor" accent="#22D3EE" spark={d.series.map((x) => x.sessions)} />
        <Kpi label="Online now" value={d.onlineNow} icon="live" accent="#10b981" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="New signups" value={d.signups} delta={d.signupsDelta} icon="sparkle" accent="#f59e0b" />
        <Kpi label="Registered members" value={userCount} icon="users" accent="#f43f5e" />
        <Kpi label="Views / visitor" value={d.uniqueVisitors ? (d.totalViews / d.uniqueVisitors).toFixed(1) : "0"} icon="chart" accent="#06b6d4" />
        <Kpi label="All-time views" value={d.totalViews.toLocaleString()} icon="eye" accent={accent} />
      </div>

      <Card className="p-5">
        <PanelHead title="Traffic overview" sub={`Page views & sessions · last ${d.range} days`} />
        {d.series.length ? <AreaChart series={d.series} accent={accent} /> : <Empty />}
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2"><PanelHead title="Top pages" /><BarList rows={d.topPaths.map((p) => ({ label: plabel(p.path), value: p.count }))} accent={accent} /></Card>
        <Card className="p-5"><PanelHead title="Traffic sources" /><Donut data={d.referrers.map((r, i) => ({ label: r.source, value: r.count, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }))} accent={accent} /></Card>
      </div>
    </div>
  );
}

function AudienceTab({ s, accent }: { s: Stats | null; accent: string }) {
  const d = s || EMPTY;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Unique visitors" value={d.uniqueVisitors.toLocaleString()} icon="user" accent="#8b5cf6" />
        <Kpi label={`Sessions · ${d.range}d`} value={d.sessions} delta={d.sessionsDelta} icon="cursor" accent={accent} />
        <Kpi label="Online now" value={d.onlineNow} icon="live" accent="#10b981" />
        <Kpi label="Countries" value={d.countries.length} icon="globe" accent="#22D3EE" />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <PanelHead title="Top countries" sub="Real geography from visitor IPs" />
          {d.countries.length ? (
            <div className="space-y-2.5">
              {d.countries.map((c) => {
                const max = Math.max(1, ...d.countries.map((x) => x.count));
                return (
                  <div key={c.code} className="flex items-center gap-3">
                    <span className="text-base shrink-0">{flag(c.code)}</span>
                    <span className="text-xs text-white/60 w-28 truncate shrink-0">{COUNTRY_NAMES[c.code] || c.code}</span>
                    <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(c.count / max) * 100}%`, backgroundColor: accent }} /></div>
                    <span className="text-xs font-bold tabular-nums w-9 text-right">{c.count}</span>
                  </div>
                );
              })}
            </div>
          ) : <Empty />}
        </Card>
        <Card className="p-5"><PanelHead title="Devices" /><Donut data={d.devices.map((x, i) => ({ label: x.name, value: x.count, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }))} accent={accent} /></Card>
      </div>
      <Card className="p-5"><PanelHead title="Sessions over time" />{d.series.length ? <AreaChart series={d.series} accent={accent} /> : <Empty />}</Card>
      <Card className="p-5"><PanelHead title="Traffic sources" /><Donut data={d.referrers.map((r, i) => ({ label: r.source, value: r.count, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }))} accent={accent} /></Card>
    </div>
  );
}

function ContentTab({ s, accent }: { s: Stats | null; accent: string }) {
  const d = s || EMPTY;
  const sectionOf = (p: string): string | null => {
    if (["home", "watch", "anime", "genre"].includes(p)) return "Anime";
    if (p.startsWith("movie") || p === "movies") return "Movies";
    if (p.startsWith("tv")) return "TV";
    if (p.startsWith("manga")) return "Manga";
    if (p.startsWith("novel")) return "Novels";
    if (p.startsWith("live")) return "Live";
    return null;
  };
  const colors: Record<string, string> = { Anime: "#48A6FF", Movies: "#F59E0B", TV: "#34D399", Manga: "#F472B6", Novels: "#a855f7", Live: "#ef4444" };
  const bySection = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of d.topPaths) { const sec = sectionOf(p.path); if (sec) m.set(sec, (m.get(sec) || 0) + p.count); }
    return [...m.entries()].map(([label, value]) => ({ label, value, color: colors[label] })).sort((a, b) => b.value - a.value);
  }, [d]);
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <PanelHead title="Engagement by section" />
        {bySection.length === 0 ? <Empty /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {bySection.map((r) => (
              <div key={r.label} className="rounded-xl border border-white/[0.06] p-4" style={{ background: `linear-gradient(135deg, ${r.color}14, transparent)` }}>
                <p className="text-2xl font-black" style={{ color: r.color }}>{r.value}</p>
                <p className="text-xs text-white/50 mt-0.5">{r.label}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card className="p-5"><PanelHead title="All viewed pages" /><BarList rows={d.topPaths.map((p) => ({ label: plabel(p.path), value: p.count }))} accent={accent} /></Card>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-white/35 text-center py-8">No data yet — real visits will appear here.</p>;
}

function StatusBadge({ status, until }: { status: Member["status"]; until: number | null }) {
  if (status === "banned") return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">BANNED</span>;
  if (status === "suspended") return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">SUSPENDED{until ? ` · ${new Date(until).toLocaleDateString()}` : ""}</span>;
  return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">ACTIVE</span>;
}

function UsersTab({
  members, loading, error, mutate, accent,
}: {
  members: Member[] | null;
  loading: boolean;
  error: string | null;
  mutate: (username: string, action: "ban" | "unban" | "suspend" | "unsuspend" | "promote" | "demote", opts?: { reason?: string; hours?: number }) => Promise<{ ok: boolean; error?: string }>;
  accent: string;
}) {
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [suspendFor, setSuspendFor] = useState<Member | null>(null);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);

  const filtered = useMemo(() => {
    if (!members) return [];
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.username.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  }, [members, query]);

  const act = async (username: string, action: "ban" | "unban" | "suspend" | "unsuspend" | "promote" | "demote", opts?: { reason?: string; hours?: number }) => {
    setBusy(username);
    setMenuFor(null);
    await mutate(username, action, opts);
    setBusy(null);
  };

  if (error === "No admin token") {
    return (
      <Card className="p-5">
        <p className="text-sm text-white/35 text-center py-8">
          Sign out and back in to link this browser as the admin — moderation actions need a verified admin session.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <PanelHead title={`Registered members (${members?.length ?? 0})`} sub="Cross-device directory — ban, suspend, unban, or promote a member to moderator." />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, username, email…"
          className="w-full sm:w-64 px-3 py-2 rounded-lg bg-[#0b0e14] border border-white/10 text-sm outline-none focus:border-white/30"
        />
      </div>

      {error && error !== "No admin token" && <p className="text-sm text-red-400 text-center py-8">{error}</p>}
      {loading && !members && <div className="flex items-center justify-center py-16"><div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" /></div>}
      {!loading && members && members.length === 0 && <p className="text-sm text-white/35 text-center py-8">No registered members yet.</p>}
      {!loading && members && members.length > 0 && filtered.length === 0 && <p className="text-sm text-white/35 text-center py-8">No members match &ldquo;{query}&rdquo;.</p>}

      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-white/40 border-b border-white/[0.06]">
              <th className="py-2 pr-3 font-bold">Member</th><th className="py-2 px-3 font-bold">Username</th><th className="py-2 px-3 font-bold">Email</th><th className="py-2 px-3 font-bold">Status</th><th className="py-2 px-3 font-bold">Joined</th><th className="py-2 pl-3 font-bold text-right">Actions</th>
            </tr></thead>
            <tbody>{filtered.map((u, i) => (
              <tr key={u.username} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                <td className="py-2.5 pr-3"><div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: accent + "22", color: accent }}>{u.name.charAt(0).toUpperCase()}</div>
                  <span className="font-semibold text-white/90 truncate">{u.name}</span>
                  {i === 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: accent + "22", color: accent }}>OWNER</span>}
                  {u.role === "mod" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400">MOD</span>}
                </div></td>
                <td className="py-2.5 px-3 text-white/45 font-mono">@{u.username}</td>
                <td className="py-2.5 px-3 text-white/45 truncate max-w-[180px]">{u.email}</td>
                <td className="py-2.5 px-3"><StatusBadge status={u.status} until={u.until} /></td>
                <td className="py-2.5 px-3 text-white/45 whitespace-nowrap">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="py-2.5 pl-3 text-right relative">
                  {busy === u.username ? (
                    <div className="w-4 h-4 ml-auto rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
                  ) : (
                    <>
                      <button onClick={() => setMenuFor(menuFor === u.username ? null : u.username)} className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.05] ml-auto">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
                      </button>
                      {menuFor === u.username && (
                        <div className="absolute right-0 top-9 z-10 w-44 rounded-lg border border-white/10 bg-[#11161f] shadow-2xl py-1 text-left">
                          {u.status === "banned" ? (
                            <button onClick={() => act(u.username, "unban")} className="w-full text-left px-3 py-2 text-xs font-semibold text-emerald-400 hover:bg-white/[0.05]">Unban</button>
                          ) : (
                            <button onClick={() => act(u.username, "ban", { reason: "Violated community guidelines" })} className="w-full text-left px-3 py-2 text-xs font-semibold text-red-400 hover:bg-white/[0.05]">Ban permanently</button>
                          )}
                          {u.status === "suspended" ? (
                            <button onClick={() => act(u.username, "unsuspend")} className="w-full text-left px-3 py-2 text-xs font-semibold text-emerald-400 hover:bg-white/[0.05]">Lift suspension</button>
                          ) : (
                            <button onClick={() => { setSuspendFor(u); setReason(""); setHours(24); setMenuFor(null); }} className="w-full text-left px-3 py-2 text-xs font-semibold text-amber-400 hover:bg-white/[0.05]">Suspend…</button>
                          )}
                          {i !== 0 && (
                            u.role === "mod" ? (
                              <button onClick={() => act(u.username, "demote")} className="w-full text-left px-3 py-2 text-xs font-semibold text-white/60 hover:bg-white/[0.05]">Remove mod</button>
                            ) : (
                              <button onClick={() => act(u.username, "promote")} className="w-full text-left px-3 py-2 text-xs font-semibold text-sky-400 hover:bg-white/[0.05]">Make mod</button>
                            )
                          )}
                        </div>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {suspendFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSuspendFor(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#11161f] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-base mb-1">Suspend @{suspendFor.username}</h3>
            <p className="text-xs text-white/45 mb-4">They&rsquo;ll be signed out and blocked from signing back in until the suspension ends.</p>
            <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1.5">Duration</label>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full mb-3 px-3 py-2 rounded-lg bg-[#0b0e14] border border-white/10 text-sm outline-none focus:border-white/30">
              <option value={1}>1 hour</option>
              <option value={24}>24 hours</option>
              <option value={24 * 7}>7 days</option>
              <option value={24 * 30}>30 days</option>
            </select>
            <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1.5">Reason (optional)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Spam, abuse, etc." className="w-full mb-4 px-3 py-2 rounded-lg bg-[#0b0e14] border border-white/10 text-sm outline-none focus:border-white/30" />
            <div className="flex gap-2">
              <button onClick={() => setSuspendFor(null)} className="flex-1 py-2 rounded-lg border border-white/10 text-sm font-bold text-white/60 hover:text-white">Cancel</button>
              <button
                onClick={async () => { const u = suspendFor.username; setSuspendFor(null); await act(u, "suspend", { reason: reason || undefined, hours }); }}
                className="flex-1 py-2 rounded-lg text-sm font-bold" style={{ backgroundColor: "#f59e0b", color: "#000" }}
              >Suspend</button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

interface ReportRow {
  id: string;
  kind: "mod" | "watch";
  byUsername: string;
  byName: string;
  message: string;
  meta?: { animeTitle?: string; episodeNum?: number; server?: string; mode?: string; error?: string; url?: string };
  createdAt: number;
  status: "open" | "resolved";
}

function ReportKindBadge({ kind }: { kind: "mod" | "watch" }) {
  if (kind === "mod") return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 shrink-0">MOD REPORT</span>;
  return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/60 shrink-0">VIEWER REPORT</span>;
}

function ReportsTab({ accent }: { accent: string }) {
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let cancel = false;
    Promise.resolve().then(async () => {
      const token = getAdminToken();
      if (!token) throw new Error("No admin token");
      const r = await fetch("/api/mod/reports", { headers: { "x-admin-token": token }, cache: "no-store" });
      return r.json();
    }).then((d) => {
      if (cancel) return;
      if (d.ok) { setReports(d.reports); setError(null); }
      else setError(d.error || "Failed to load reports");
    }).catch((e) => { if (!cancel) setError(e instanceof Error ? e.message : "Failed to load reports"); });
    return () => { cancel = true; };
  }, [bump]);

  const setStatus = async (id: string, status: "open" | "resolved" | "dismissed") => {
    const token = getAdminToken();
    if (!token) return;
    setBusy(id);
    await fetch("/api/mod/reports", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ id, status: status === "dismissed" ? "resolved" : status }),
    }).catch(() => {});
    setBusy(null);
    setBump((b) => b + 1);
  };

  if (error === "No admin token") {
    return (
      <Card className="p-5">
        <p className="text-sm text-white/35 text-center py-8">Sign out and back in to link this browser as the admin.</p>
      </Card>
    );
  }

  const open = (reports || []).filter((r) => r.status === "open");
  const resolved = (reports || []).filter((r) => r.status === "resolved");

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <PanelHead title="Reports" sub="Issues flagged by your mods and by viewers reporting broken playback." />
        <button onClick={() => setBump((b) => b + 1)} className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-bold text-white/60 hover:text-white hover:bg-white/[0.05]">Refresh</button>
      </div>
      {error && error !== "No admin token" && <p className="text-sm text-red-400 text-center py-8">{error}</p>}
      {!error && reports === null && <div className="flex items-center justify-center py-16"><div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" /></div>}
      {reports !== null && reports.length === 0 && <p className="text-sm text-white/35 text-center py-8">No reports yet.</p>}

      {open.length > 0 && (
        <div className="space-y-2 mb-6">
          <p className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Open ({open.length})</p>
          {open.map((r) => (
            <div key={r.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <ReportKindBadge kind={r.kind} />
                  <p className="text-[11px] text-white/40">@{r.byUsername} · {new Date(r.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-sm text-white/90">{r.message}</p>
                {r.meta && (r.meta.server || r.meta.error || r.meta.url) && (
                  <p className="text-[11px] text-white/40 mt-1 font-mono truncate">
                    {[r.meta.server && `server: ${r.meta.server}`, r.meta.mode && `mode: ${r.meta.mode}`, r.meta.error && `error: ${r.meta.error}`].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setStatus(r.id, "resolved")}
                  disabled={busy === r.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ backgroundColor: accent, color: "#000" }}
                >{busy === r.id ? "…" : "Resolve"}</button>
                <button
                  onClick={() => setStatus(r.id, "dismissed")}
                  disabled={busy === r.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-white/10 text-white/50 hover:text-white hover:bg-white/[0.05]"
                >{busy === r.id ? "…" : "Dismiss"}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Resolved ({resolved.length})</p>
          {resolved.map((r) => (
            <div key={r.id} className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3.5 flex items-start justify-between gap-3 opacity-60">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <ReportKindBadge kind={r.kind} />
                  <p className="text-[11px] text-white/35">@{r.byUsername} · {new Date(r.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-sm text-white/70">{r.message}</p>
              </div>
              <button onClick={() => setStatus(r.id, "open")} disabled={busy === r.id} className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border border-white/10 text-white/60 hover:text-white">Reopen</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   XP Leaderboard tab
   ============================================================ */
interface LeaderboardEntry {
  rank: number;
  username: string;
  name: string;
  totalXP: number;
  level: number;
  lastActive: string;
}

function XpLeaderboardTab({ accent }: { accent: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAdminToken();
      if (!token) throw new Error("No admin token");
      const r = await fetch("/api/xp/leaderboard", { headers: { "x-admin-token": token }, cache: "no-store" });
      const d = await r.json();
      if (d.ok) { setEntries(d.leaderboard); setError(null); }
      else setError(d.error || "Failed to load leaderboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leaderboard");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  if (error === "No admin token") {
    return (
      <Card className="p-5">
        <p className="text-sm text-white/35 text-center py-8">Sign out and back in to access the leaderboard.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <PanelHead title="XP Leaderboard" sub="Top users ranked by accumulated experience points." />
        <button onClick={fetchLeaderboard} className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-bold text-white/60 hover:text-white hover:bg-white/[0.05]">Refresh</button>
      </div>

      {error && <p className="text-sm text-red-400 text-center py-8">{error}</p>}
      {loading && !entries && <div className="flex items-center justify-center py-16"><div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" /></div>}
      {entries && entries.length === 0 && <p className="text-sm text-white/35 text-center py-8">No users on the leaderboard yet.</p>}

      {entries && entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-white/40 border-b border-white/[0.06]">
                <th className="py-2 pr-3 font-bold">Rank</th>
                <th className="py-2 px-3 font-bold">User</th>
                <th className="py-2 px-3 font-bold">Username</th>
                <th className="py-2 px-3 font-bold">Total XP</th>
                <th className="py-2 px-3 font-bold">Level</th>
                <th className="py-2 pl-3 font-bold">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.username} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-3">
                    <span className={`text-xs font-bold ${e.rank <= 3 ? "px-2 py-1 rounded-full" : ""}`}
                      style={e.rank <= 3 ? { backgroundColor: e.rank === 1 ? "#f59e0b" : e.rank === 2 ? "#94a3b8" : "#cd7f32", color: "#000" } : undefined}>
                      {e.rank <= 3 ? ["🥇", "🥈", "🥉"][e.rank - 1] : `#${e.rank}`}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: accent + "22", color: accent }}>{e.name.charAt(0).toUpperCase()}</div>
                      <span className="font-semibold text-white/90">{e.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-white/45 font-mono">@{e.username}</td>
                  <td className="py-2.5 px-3 font-bold tabular-nums">{e.totalXP.toLocaleString()}</td>
                  <td className="py-2.5 px-3"><span className="text-xs font-bold px-2 py-1 rounded-full" style={{ backgroundColor: accent + "22", color: accent }}>Lv {e.level}</span></td>
                  <td className="py-2.5 pl-3 text-white/45 whitespace-nowrap">{new Date(e.lastActive).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   Announcements tab
   ============================================================ */
interface Announcement {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "update";
  createdAt: number;
  expiry: number | null;
  active: boolean;
}

function AnnouncementsTab({ accent }: { accent: string }) {
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Create form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"info" | "warning" | "update">("info");
  const [expiry, setExpiry] = useState<string>("");
  const [createMsg, setCreateMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const fetchAnnouncements = useCallback(async () => {
    setError(null);
    try {
      const token = getAdminToken();
      if (!token) throw new Error("No admin token");
      const r = await fetch("/api/admin/announcements", { headers: { "x-admin-token": token }, cache: "no-store" });
      const d = await r.json();
      if (d.ok) { setAnnouncements(d.announcements); setError(null); }
      else setError(d.error || "Failed to load announcements");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load announcements");
    }
  }, []);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  const createAnnouncement = async () => {
    const token = getAdminToken();
    if (!token) { setCreateMsg({ ok: false, t: "No admin token" }); return; }
    setBusy("create");
    try {
      const expiryNum = expiry ? new Date(expiry).getTime() : null;
      const r = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ action: "create", title, message, type, expiry: expiryNum }),
      });
      const d = await r.json();
      if (d.ok) {
        setTitle(""); setMessage(""); setType("info"); setExpiry("");
        setCreateMsg({ ok: true, t: "Announcement created" });
        await fetchAnnouncements();
      } else {
        setCreateMsg({ ok: false, t: d.error || "Failed" });
      }
    } catch {
      setCreateMsg({ ok: false, t: "Network error" });
    } finally { setBusy(null); }
  };

  const deleteAnnouncement = async (id: string) => {
    const token = getAdminToken();
    if (!token) return;
    setBusy(id);
    await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ action: "delete", id }),
    }).catch(() => {});
    setBusy(null);
    await fetchAnnouncements();
  };

  const typeColor = (t: string) => t === "warning" ? "#f59e0b" : t === "update" ? "#8b5cf6" : "#3b82f6";

  if (error === "No admin token") {
    return (
      <Card className="p-5">
        <p className="text-sm text-white/35 text-center py-8">Sign out and back in to manage announcements.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <PanelHead title="Create announcement" sub="Post a site-wide announcement visible to all users." />
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1.5">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title" className="w-full px-3 py-2 rounded-lg bg-[#0b0e14] border border-white/10 text-sm outline-none focus:border-white/30" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1.5">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as "info" | "warning" | "update")} className="w-full px-3 py-2 rounded-lg bg-[#0b0e14] border border-white/10 text-sm outline-none focus:border-white/30">
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="update">Update</option>
            </select>
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1.5">Message</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Announcement message…" className="w-full px-3 py-2 rounded-lg bg-[#0b0e14] border border-white/10 text-sm outline-none focus:border-white/30 resize-none" />
        </div>
        <div className="mb-4">
          <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1.5">Expiry date (optional)</label>
          <input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[#0b0e14] border border-white/10 text-sm outline-none focus:border-white/30" />
        </div>
        {createMsg && <p className={`text-xs mb-3 ${createMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{createMsg.t}</p>}
        <button onClick={createAnnouncement} disabled={busy === "create" || !title.trim() || !message.trim()}
          className="px-4 py-2 rounded-lg text-black text-sm font-bold disabled:opacity-40" style={{ backgroundColor: accent }}>
          {busy === "create" ? "Creating…" : "Create announcement"}
        </button>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <PanelHead title="Active announcements" sub={`${announcements?.length ?? 0} announcements currently active`} />
          <button onClick={fetchAnnouncements} className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-bold text-white/60 hover:text-white hover:bg-white/[0.05]">Refresh</button>
        </div>

        {error && <p className="text-sm text-red-400 text-center py-8">{error}</p>}
        {!error && announcements === null && <div className="flex items-center justify-center py-16"><div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" /></div>}
        {announcements && announcements.length === 0 && <p className="text-sm text-white/35 text-center py-8">No active announcements.</p>}

        {announcements && announcements.length > 0 && (
          <div className="space-y-2.5">
            {announcements.map((a) => (
              <div key={a.id} className="rounded-xl border border-white/[0.08] p-3.5 flex items-start justify-between gap-3"
                style={{ background: `linear-gradient(135deg, ${typeColor(a.type)}08, transparent)` }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: typeColor(a.type) + "20", color: typeColor(a.type) }}>{a.type.toUpperCase()}</span>
                    <p className="text-sm font-bold text-white/90">{a.title}</p>
                    <p className="text-[11px] text-white/40">{new Date(a.createdAt).toLocaleString()}</p>
                    {a.expiry && <p className="text-[11px] text-white/35">Expires {new Date(a.expiry).toLocaleString()}</p>}
                  </div>
                  <p className="text-sm text-white/70">{a.message}</p>
                </div>
                <button onClick={() => deleteAnnouncement(a.id)} disabled={busy === a.id}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-red-400 border border-red-500/20 hover:bg-red-500/10 disabled:opacity-40">
                  {busy === a.id ? "…" : "Delete"}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function SeoTab({ accent }: { accent: string }) {
  const [s, setS] = useState<SeoSettings>(() => loadSeo());
  const [saved, setSaved] = useState(false);
  const audit = useMemo(() => auditSeo(s), [s]);
  const set = (k: keyof SeoSettings, v: string | boolean) => { setS((p) => ({ ...p, [k]: v })); setSaved(false); };
  const scoreColor = audit.score >= 80 ? "#10b981" : audit.score >= 50 ? "#f59e0b" : "#ef4444";
  const field = (label: string, k: keyof SeoSettings, area = false, ph = "") => (
    <div className="mb-4">
      <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1.5">{label}</label>
      {area
        ? <textarea value={String(s[k])} onChange={(e) => set(k, e.target.value)} rows={3} placeholder={ph} className="w-full px-3 py-2 rounded-lg bg-[#0b0e14] border border-white/10 text-sm outline-none focus:border-white/30 resize-none" />
        : <input value={String(s[k])} onChange={(e) => set(k, e.target.value)} placeholder={ph} className="w-full px-3 py-2 rounded-lg bg-[#0b0e14] border border-white/10 text-sm outline-none focus:border-white/30" />}
    </div>
  );
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-bold">Search engine optimization</h2><span className="text-lg font-black" style={{ color: scoreColor }}>{audit.score}<span className="text-white/30 text-xs font-bold">/100</span></span></div>
        {field("Site name", "siteName")}
        {field("Meta title", "title")}
        {field("Meta description", "description", true)}
        {field("Keywords", "keywords", true)}
        {field("Canonical URL", "canonicalUrl", false, "https://…")}
        <div className="grid grid-cols-2 gap-3">{field("OG image URL", "ogImage", false, "/og.png")}{field("Twitter handle", "twitterHandle", false, "@handle")}</div>
        <label className="flex items-center gap-2.5 mb-5 cursor-pointer"><input type="checkbox" checked={s.robotsIndex} onChange={(e) => set("robotsIndex", e.target.checked)} className="w-4 h-4" style={{ accentColor: accent }} /><span className="text-sm text-white/70">Allow search engines to index the site</span></label>
        <div className="flex gap-2">
          <button onClick={() => { saveSeo(s); setSaved(true); }} className="px-4 py-2 rounded-lg text-black text-sm font-bold" style={{ backgroundColor: accent }}>{saved ? "Saved ✓" : "Save settings"}</button>
          <button onClick={() => { setS(DEFAULT_SEO); setSaved(false); }} className="px-4 py-2 rounded-lg border border-white/10 text-sm font-bold text-white/50">Reset</button>
        </div>
      </Card>
      <div className="space-y-6">
        <Card className="p-5"><PanelHead title="Google preview" />
          <div className="rounded-lg bg-white p-3">
            <p className="text-[#1a0dab] text-[15px] leading-snug truncate">{s.title || "Page title"}</p>
            <p className="text-[#006621] text-xs truncate">{s.canonicalUrl || "https://luffytv.app"}</p>
            <p className="text-[#545454] text-xs leading-snug line-clamp-2 mt-0.5">{s.description || "Meta description…"}</p>
          </div>
          <p className="text-[10px] text-white/40 mt-2">sitemap.xml, robots.txt & structured data ship automatically.</p>
        </Card>
        <Card className="p-5"><PanelHead title="SEO audit" />
          <div className="space-y-2">{audit.checks.map((c) => (
            <div key={c.id} className="flex items-start gap-2" title={c.hint}>
              <span className={`text-sm mt-0.5 ${c.ok ? "text-emerald-500" : "text-red-500"}`}>{c.ok ? "✓" : "✗"}</span>
              <div><p className={`text-xs font-semibold ${c.ok ? "text-white/70" : "text-white/50"}`}>{c.label}</p>{!c.ok && <p className="text-[10px] text-white/35">{c.hint}</p>}</div>
            </div>
          ))}</div>
        </Card>
      </div>
    </div>
  );
}

function SettingsTab({ accent, setAccent }: { accent: string; setAccent: (v: string) => void; onData: () => void }) {
  const [oldPw, setOldPw] = useState(""); const [newPw, setNewPw] = useState(""); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [countMe, setCountMe] = useState(() => !isOwnerBrowser());
  const changePw = () => { const r = changeAdminPassword(oldPw, newPw); setMsg({ ok: r.ok, t: r.ok ? "Password updated" : (r.error || "Failed") }); if (r.ok) { setOldPw(""); setNewPw(""); } };
  const toggleCount = () => { const next = !countMe; setCountMe(next); setOwnerBrowser(!next); };
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="p-5">
        <PanelHead title="Appearance" sub="Personalize your admin console" />
        <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-2">Accent color</label>
        <div className="flex gap-2.5 flex-wrap">
          {ACCENTS.map((a) => (
            <button key={a.id} onClick={() => setAccent(a.v)} className={`w-9 h-9 rounded-full border-2 transition-all ${accent === a.v ? "border-white scale-110" : "border-white/10 hover:scale-105"}`} style={{ backgroundColor: a.v }} title={a.id} />
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <PanelHead title="Change password" sub="Update your admin credentials" />
        <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="Current password" className="w-full px-3 py-2 rounded-lg bg-[#0b0e14] border border-white/10 text-sm outline-none focus:border-white/30 mb-3" />
        <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password (min 6)" className="w-full px-3 py-2 rounded-lg bg-[#0b0e14] border border-white/10 text-sm outline-none focus:border-white/30 mb-3" />
        {msg && <p className={`text-xs mb-3 ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.t}</p>}
        <button onClick={changePw} className="px-4 py-2 rounded-lg text-black text-sm font-bold" style={{ backgroundColor: accent }}>Update password</button>
      </Card>

      <Card className="p-5 lg:col-span-2">
        <PanelHead title="Tracking" sub="How real visitor analytics are collected" />
        <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
          <span className="text-sm text-white/70">Count my own visits in analytics</span>
          <button onClick={toggleCount} className="relative w-11 h-6 rounded-full transition-colors" style={{ backgroundColor: countMe ? accent : "rgba(255,255,255,0.12)" }}>
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: countMe ? "22px" : "2px" }} />
          </button>
        </label>
        <p className="text-[11px] text-white/35 mt-3 max-w-2xl leading-relaxed">
          Visitor analytics are recorded server-side and aggregated in a KV store (real, global). Your own visits are excluded by default so they
          don&apos;t inflate the numbers. To enable global counting on Vercel: <b>Storage → Create → KV → Connect to project</b> — no code changes needed.
        </p>
      </Card>
    </div>
  );
}

/* ============================================================
   Inline icon set (stroke)
   ============================================================ */
function NavIcon({ name }: { name: string }) {
  const p: Record<string, string> = {
    grid: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z",
    users: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8z",
    film: "M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z",
    user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    search: "M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z",
    cog: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
    eye: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
    cursor: "M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122",
    bounce: "M13 10V3L4 14h7v7l9-11h-7z",
    clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    live: "M12 12a3 3 0 100-6 3 3 0 000 6z M4.5 4.5a10.5 10.5 0 000 15M19.5 4.5a10.5 10.5 0 010 15M7.5 7.5a6 6 0 000 9M16.5 7.5a6 6 0 010 9",
    repeat: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
    chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    sparkle: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
    refresh: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
    globe: "M21 12a9 9 0 11-18 0 9 9 0 0118 0z M3.6 9h16.8M3.6 15h16.8 M12 3a15 15 0 010 18 M12 3a15 15 0 000 18",
    logout: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
    collapse: "M11 19l-7-7 7-7m8 14l-7-7 7-7",
    expand: "M13 5l7 7-7 7M5 5l7 7-7 7",
    flag: "M4 3v18M4 4h13l-2 4 2 4H4",
    megaphone: "M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z M11 4a4 4 0 014 4 M11 8a2 2 0 012 2",
  };
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={p[name] || p.grid} />
    </svg>
  );
}
